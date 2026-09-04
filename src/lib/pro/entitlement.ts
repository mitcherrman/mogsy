import { supabase } from "@/integrations/supabase/client";

/**
 * PT1.4 — the one frontend accessor for effective Pro entitlement.
 *
 * Pro is the union of two independent sources:
 *
 *     effective_pro = stripe_pro OR valid_manual_grant
 *
 * The composition rule lives in Postgres (`public.pro_entitlement_is_effective`)
 * and is surfaced by the self-scoped `my_pro_entitlement()` RPC. Nothing in the
 * frontend re-implements the OR, and nothing outside admin tooling should read
 * `profiles.is_pro` — that column is the Stripe-derived half only, so reading it
 * directly reports a comped playtester as Free.
 *
 * The frontend is never authoritative: these values drive presentation, while
 * the backend re-resolves entitlement (services/pro_status.py) for every gate.
 */
export type ProGrantKind = "manual" | "playtest" | "promo" | "gift";

export interface ProEntitlement {
  /** The answer UI should key off. */
  effectivePro: boolean;
  /** Paid Stripe subscription (active or trialing). */
  stripePro: boolean;
  /** Non-Stripe grant, only when it is currently valid. */
  grantKind: ProGrantKind | null;
  /** Grant expiry; null with a non-null kind means it does not expire. */
  grantExpiresAt: string | null;
  grantReason: string | null;
}

const FREE: ProEntitlement = {
  effectivePro: false,
  stripePro: false,
  grantKind: null,
  grantExpiresAt: null,
  grantReason: null,
};

/**
 * Resolve the signed-in caller's entitlement.
 *
 * Returns null when the answer is *unknown* (RPC unavailable, network failure,
 * signed out mid-flight) so callers can hold an explicit unresolved state rather
 * than paywalling a Pro user or, worse, unlocking a Free one.
 */
export async function fetchProEntitlement(): Promise<ProEntitlement | null> {
  const { data, error } = await (supabase as any).rpc("my_pro_entitlement");
  if (error) return null;

  // SETOF-returning RPC: a list, or a bare object on some PostgREST versions.
  const row = Array.isArray(data) ? data[0] : data;
  // No row = the profile does not exist yet. That is a real Free, not unknown.
  if (!row) return FREE;

  return {
    effectivePro: !!row.effective_pro,
    stripePro: !!row.stripe_pro,
    grantKind: (row.grant_kind as ProGrantKind) ?? null,
    grantExpiresAt: row.grant_expires_at ?? null,
    grantReason: row.grant_reason ?? null,
  };
}

/** The shape of the entitlement columns as they sit on a profiles row. */
export interface ProEntitlementColumns {
  is_pro?: boolean | null;
  pro_grant_kind?: string | null;
  pro_grant_expires_at?: string | null;
}

/**
 * Client-side mirror of the SQL rule in `public.pro_entitlement_is_effective`,
 * for a profiles row the client already holds — a page that selected the
 * entitlement columns alongside other fields, or admin tooling rendering
 * *other* users' rows, which the self-scoped RPC cannot answer for.
 *
 * Presentation only. No entitlement is actually granted here: every gate is
 * enforced by the backend (services/pro_status.py → my_pro_entitlement), which
 * is the authority, and no route trusts a client-supplied entitlement flag.
 * Keep this in step with the SQL definition if that ever changes.
 *
 * The row MUST have been selected with `is_pro, pro_grant_kind,
 * pro_grant_expires_at` — a row missing the grant columns silently reads as
 * Stripe-only, which is the very bug PT1.4 fixes.
 */
export function isEffectivePro(row: ProEntitlementColumns | null | undefined): boolean {
  if (!row) return false;
  const grantValid =
    row.pro_grant_kind != null &&
    (row.pro_grant_expires_at == null || Date.parse(row.pro_grant_expires_at) > Date.now());
  return !!row.is_pro || grantValid;
}

/** Human-readable provenance for admin tooling: why is this account Pro? */
export function describeProSource(row: ProEntitlementColumns | null | undefined): string {
  if (!row) return "Free";
  const parts: string[] = [];
  if (row.is_pro) parts.push("Stripe subscription");
  if (row.pro_grant_kind != null &&
      (row.pro_grant_expires_at == null || Date.parse(row.pro_grant_expires_at) > Date.now())) {
    parts.push(
      row.pro_grant_expires_at
        ? `${row.pro_grant_kind} grant until ${new Date(row.pro_grant_expires_at).toLocaleDateString()}`
        : `${row.pro_grant_kind} grant (no expiry)`
    );
  }
  return parts.length ? parts.join(" + ") : "Free";
}
