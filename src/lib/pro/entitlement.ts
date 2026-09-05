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

/**
 * Human-readable provenance for admin tooling: why is this account Premium?
 *
 * ADMIN1A: a bare `is_pro = true` reads as "Legacy Premium", never as a Stripe
 * subscription — see `describePremiumProvenance` below for why that assertion
 * cannot be made from a profiles row. Pass `stripeVerified` only when the
 * caller actually holds Stripe evidence for THIS account.
 */
export function describeProSource(
  row: PremiumProvenanceColumns | null | undefined,
  options: PremiumProvenanceOptions = {},
): string {
  const p = describePremiumProvenance(row, options);
  if (!p.effectivePremium) return "Free";

  const parts: string[] = [];
  if (p.stripe.verified) parts.push("Stripe subscription");
  else if (p.stripe.flagged) parts.push("Legacy Premium");
  if (p.grant.valid) {
    parts.push(
      p.grant.expiresAt
        ? `${p.grant.rawKind} grant until ${formatGrantExpiry(p.grant.expiresAt)}`
        : `${p.grant.rawKind} grant (no expiry)`,
    );
  }
  return parts.join(" + ");
}

// ---------------------------------------------------------------------------
// ADMIN1A — Premium provenance.
//
// WHY THIS EXISTS
// `describeProSource` used to map `is_pro === true` to the literal string
// "Stripe subscription". That assertion cannot be justified from any data the
// frontend can see: `public.profiles` carries no Stripe customer, subscription
// or price identifier, and the one Stripe oracle that does exist
// (`check-subscription`) is SELF-SCOPED — it reads the CALLER's token, so an
// admin can never use it to establish provenance for somebody else's account.
//
// So a raw `is_pro = true` is exactly two things at once: it could be an active
// subscription, and it could be a pre-PT1.4 value the migration deliberately
// left in place. The honest label for that is LEGACY, not Stripe. Admin must
// never assert a subscription it cannot evidence — that assertion is what let
// COMBAT1 read `effective_pro: true` as "the playtest grant was written" when
// `pro_grant_kind` was still null.
//
// Nothing here changes entitlement. `pro_entitlement_is_effective` in Postgres
// remains the authority and `isEffectivePro` remains its client-side mirror;
// this module only decides what an admin is told about WHY.
// ---------------------------------------------------------------------------

export const PRO_GRANT_KINDS: readonly ProGrantKind[] = [
  "manual",
  "playtest",
  "promo",
  "gift",
] as const;

/**
 * The resolved provenance of an account's Premium.
 *
 * `legacy` is the deliberate conservative state: effective Premium exists, no
 * grant explains it, and Stripe cannot be proven from here.
 */
export type PremiumSource =
  | "free"
  | "stripe"
  | "legacy"
  | "manual-grant"
  | "playtest-grant"
  | "promo-grant"
  | "gift-grant";

export const PREMIUM_SOURCE_LABELS: Record<PremiumSource, string> = {
  free: "Free",
  stripe: "Stripe",
  legacy: "Legacy Premium",
  "manual-grant": "Manual grant",
  "playtest-grant": "Playtest grant",
  "promo-grant": "Promo grant",
  "gift-grant": "Gift grant",
};

/** The grant columns as they sit on a profiles row, plus attribution. */
export interface PremiumProvenanceColumns extends ProEntitlementColumns {
  pro_grant_reason?: string | null;
  pro_grant_granted_at?: string | null;
  pro_grant_granted_by?: string | null;
}

export interface PremiumGrantFacts {
  /** A canonical kind, or null when absent or unrecognised. */
  kind: ProGrantKind | null;
  /** Whatever the column actually held — a future writer's kind still renders. */
  rawKind: string | null;
  expiresAt: string | null;
  reason: string | null;
  grantedAt: string | null;
  grantedBy: string | null;
  /** A grant row exists at all, valid or not. */
  present: boolean;
  /** Exists AND is currently in force. */
  valid: boolean;
  /**
   * Exists but its expiry has passed.
   *
   * `admin_set_pro_grant` returns the raw columns without the validity CASE
   * that `my_pro_entitlement` applies, so a grant written with a past expiry
   * comes back as a real kind with `effective_pro: false`. That is a written
   * grant that has expired — never a failed write, and the UI must say so.
   */
  expired: boolean;
}

export interface PremiumStripeFacts {
  /** The raw `profiles.is_pro` column. Provenance-free by construction. */
  flagged: boolean;
  /**
   * True only when the caller supplied real Stripe evidence. Admin tooling
   * looking at ANOTHER account can never set this, which is the point.
   */
  verified: boolean;
  label: string;
}

export interface PremiumProvenance {
  /** The same answer `isEffectivePro` gives. Presentation only. */
  effectivePremium: boolean;
  source: PremiumSource;
  sourceLabel: string;
  stripe: PremiumStripeFacts;
  grant: PremiumGrantFacts;
  /** Set only for `legacy`: the sentence explaining what is unproven. */
  caution: string | null;
}

export interface PremiumProvenanceOptions {
  /**
   * Positive Stripe evidence for THIS account — a `check-subscription`
   * response, which only ever answers for the signed-in caller. Omitted (the
   * admin case) means "not established", never "no subscription".
   */
  stripeVerified?: boolean;
}

const EMPTY_GRANT: PremiumGrantFacts = {
  kind: null,
  rawKind: null,
  expiresAt: null,
  reason: null,
  grantedAt: null,
  grantedBy: null,
  present: false,
  valid: false,
  expired: false,
};

const LEGACY_CAUTION =
  "Premium comes from a legacy is_pro value. No grant explains it, and a Stripe " +
  "subscription cannot be verified from Admin. Provenance is not recorded.";

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Grant facts from a row, tolerating a row that never selected the columns. */
export function readPremiumGrant(
  row: PremiumProvenanceColumns | null | undefined,
): PremiumGrantFacts {
  const rawKind = text(row?.pro_grant_kind);
  if (!rawKind) return EMPTY_GRANT;
  const expiresAt = text(row?.pro_grant_expires_at);
  const expired = expiresAt != null && Date.parse(expiresAt) <= Date.now();
  return {
    kind: (PRO_GRANT_KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as ProGrantKind)
      : null,
    rawKind,
    expiresAt,
    reason: text(row?.pro_grant_reason),
    grantedAt: text(row?.pro_grant_granted_at),
    grantedBy: text(row?.pro_grant_granted_by),
    present: true,
    valid: !expired,
    expired,
  };
}

/**
 * Resolve why an account is Premium, as separable facts rather than a string.
 *
 * Precedence for the single `source` label: a valid grant wins, because it is
 * the only provenance the data actually records. `stripe` and `legacy` are the
 * two readings of a bare `is_pro`, separated by whether the caller could prove
 * it. Both halves are always returned, so a UI can render them as independent
 * rows and an empty grant row is visible AS empty.
 */
export function describePremiumProvenance(
  row: PremiumProvenanceColumns | null | undefined,
  options: PremiumProvenanceOptions = {},
): PremiumProvenance {
  const grant = readPremiumGrant(row);
  const flagged = row?.is_pro === true;
  const verified = flagged && options.stripeVerified === true;
  const effectivePremium = flagged || grant.valid;

  let source: PremiumSource;
  if (!effectivePremium) source = "free";
  else if (grant.valid && grant.kind) source = `${grant.kind}-grant` as PremiumSource;
  else if (grant.valid) source = "manual-grant"; // unrecognised kind, still a grant
  else if (verified) source = "stripe";
  else source = "legacy";

  return {
    effectivePremium,
    source,
    sourceLabel: PREMIUM_SOURCE_LABELS[source],
    stripe: {
      flagged,
      verified,
      label: verified
        ? "Active subscription"
        : flagged
          ? "Not established — legacy is_pro flag"
          : "None",
    },
    grant,
    caution: source === "legacy" ? LEGACY_CAUTION : null,
  };
}

/** "3 Dec 2026", or null. Kept here so every Premium surface dates alike. */
export function formatGrantExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString() : expiresAt;
}

/**
 * One-line grant summary: "playtest · expires 3 Dec 2026", "manual · no expiry",
 * "promo · expired 1 Jan 2026", or null when no grant exists.
 */
export function describeGrant(grant: PremiumGrantFacts): string | null {
  if (!grant.present) return null;
  const when = formatGrantExpiry(grant.expiresAt);
  if (grant.expired) return `${grant.rawKind} · expired ${when}`;
  return `${grant.rawKind} · ${when ? `expires ${when}` : "no expiry"}`;
}
