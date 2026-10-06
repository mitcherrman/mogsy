// OWN1 — Edge Function owner gate. Never trusts any header but Authorization.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { decideOwnerAccess, type OwnerDecision, type OwnerLevel } from "./owner-decision.ts";

export interface OwnerContext {
  userId: string;
  authHeader: string;
  // deno-lint-ignore no-explicit-any
  service: any;
  // deno-lint-ignore no-explicit-any
  asCaller: any;
}

export async function requireOwner(
  req: Request,
  level: OwnerLevel,
): Promise<{ decision: OwnerDecision; ctx: OwnerContext | null }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { decision: { ok: false, status: 401, code: "unauthorized" }, ctx: null };
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: userData } = await asCaller.auth.getUser();
  const verifiedUserId = userData?.user?.id ?? null;
  const [{ data: configured }, { data: state }] = await Promise.all([
    service.rpc("owner_configured_id"),
    verifiedUserId ? asCaller.rpc("owner_auth_state") : Promise.resolve({ data: null }),
  ]);

  const decision = decideOwnerAccess({
    verifiedUserId,
    envOwnerId: Deno.env.get("OWNER_USER_ID"),
    configuredOwnerId: (configured as string | null) ?? null,
    state: (state as Record<string, unknown> | null) ?? null,
    level,
  });
  return {
    decision,
    ctx: decision.ok && verifiedUserId ? { userId: verifiedUserId, authHeader, service, asCaller } : null,
  };
}

/** Durable audit row written with the CALLER's JWT (records aal + session). */
export async function auditOwnerAction(
  ctx: OwnerContext, action: string, result: string, detail: Record<string, unknown>, targetProfileId: string | null = null,
): Promise<void> {
  const { error } = await ctx.asCaller.rpc("log_owner_action", {
    _action: action, _target_profile_id: targetProfileId, _result: result, _detail: detail,
  });
  if (error) {
    // Fall back to a service-role insert so the event is never silently lost.
    await ctx.service.from("admin_audit_log").insert({
      actor_user_id: ctx.userId, action, result, detail: { ...detail, audit_fallback: true },
      target_profile_id: targetProfileId,
    });
  }
}
