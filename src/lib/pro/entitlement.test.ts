import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * PT1.4 — the frontend entitlement accessor.
 *
 * The bug this replaces: every frontend Pro read went straight to
 * `profiles.is_pro`, which Stripe force-syncs. A comped playtester therefore
 * rendered as Free the moment Stripe reconciliation ran.
 */
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  fetchProEntitlement,
  isEffectivePro,
  describeProSource,
  describePremiumProvenance,
  describeGrant,
  readPremiumGrant,
} from "./entitlement";

const DAY = 86400000;
const future = new Date(Date.now() + 30 * DAY).toISOString();
const past = new Date(Date.now() - DAY).toISOString();

beforeEach(() => rpc.mockReset());

describe("fetchProEntitlement", () => {
  it("asks the canonical resolver, never a raw is_pro read", async () => {
    rpc.mockResolvedValue({ data: [{ effective_pro: true, stripe_pro: false }], error: null });
    const result = await fetchProEntitlement();
    expect(rpc).toHaveBeenCalledWith("my_pro_entitlement");
    expect(result?.effectivePro).toBe(true);
    // The Stripe half is reported separately and is NOT the answer.
    expect(result?.stripePro).toBe(false);
  });

  it("surfaces grant provenance when a grant is what makes the caller Pro", async () => {
    rpc.mockResolvedValue({
      data: [{
        effective_pro: true, stripe_pro: false,
        grant_kind: "playtest", grant_expires_at: future, grant_reason: "Founding playtester",
      }],
      error: null,
    });
    const result = await fetchProEntitlement();
    expect(result).toMatchObject({
      effectivePro: true,
      stripePro: false,
      grantKind: "playtest",
      grantReason: "Founding playtester",
    });
  });

  it("accepts a bare object as well as a one-row list", async () => {
    rpc.mockResolvedValue({ data: { effective_pro: true }, error: null });
    expect((await fetchProEntitlement())?.effectivePro).toBe(true);
  });

  it("reports Free — not unknown — when the profile row does not exist", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchProEntitlement()).toMatchObject({ effectivePro: false });
  });

  it("returns null (unknown) on error so callers can fail closed", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await fetchProEntitlement()).toBeNull();
  });
});

describe("isEffectivePro — the admin-side mirror of the SQL rule", () => {
  const cases: Array<[string, Record<string, unknown>, boolean]> = [
    ["stripe inactive + no grant", { is_pro: false }, false],
    ["stripe null + no grant", { is_pro: null }, false],
    ["stripe active + no grant", { is_pro: true }, true],
    ["stripe inactive + valid grant", { is_pro: false, pro_grant_kind: "playtest", pro_grant_expires_at: future }, true],
    ["stripe inactive + unexpiring grant", { is_pro: false, pro_grant_kind: "manual", pro_grant_expires_at: null }, true],
    ["stripe active + valid grant", { is_pro: true, pro_grant_kind: "playtest", pro_grant_expires_at: future }, true],
    ["stripe active + expired grant", { is_pro: true, pro_grant_kind: "playtest", pro_grant_expires_at: past }, true],
    ["stripe inactive + expired grant", { is_pro: false, pro_grant_kind: "playtest", pro_grant_expires_at: past }, false],
  ];
  it.each(cases)("%s", (_label, row, expected) => {
    expect(isEffectivePro(row)).toBe(expected);
  });

  it("an expiry alone, with no kind, is not a grant", () => {
    expect(isEffectivePro({ is_pro: false, pro_grant_expires_at: future })).toBe(false);
  });

  it("an invite promo with no Stripe subscription is Pro, permanently", () => {
    // The invite path grants promo with a NULL expiry, matching its historical
    // never-expiring behaviour. Stripe having no subscription is irrelevant.
    expect(isEffectivePro({
      is_pro: false, pro_grant_kind: "promo", pro_grant_expires_at: null,
    })).toBe(true);
  });

  it("revoking an invite promo leaves an active Stripe subscriber Pro", () => {
    expect(isEffectivePro({ is_pro: true, pro_grant_kind: null })).toBe(true);
  });
});

describe("describeProSource", () => {
  it("names both sources when both are live, and never asserts an unverified subscription", () => {
    const row = { is_pro: true, pro_grant_kind: "playtest", pro_grant_expires_at: future };
    // Without Stripe evidence the is_pro half reads as legacy — see ADMIN1A.
    expect(describeProSource(row)).toContain("Legacy Premium");
    expect(describeProSource(row)).toContain("playtest grant");
    // With evidence, and only then, it names the subscription.
    const verified = describeProSource(row, { stripeVerified: true });
    expect(verified).toContain("Stripe subscription");
    expect(verified).toContain("playtest grant");
  });

  it("never calls a bare is_pro a Stripe subscription", () => {
    expect(describeProSource({ is_pro: true })).toBe("Legacy Premium");
  });

  it("names an invite promo as the source", () => {
    expect(describeProSource({
      is_pro: false, pro_grant_kind: "promo", pro_grant_expires_at: null,
    })).toBe("promo grant (no expiry)");
  });

  it("ignores an expired grant", () => {
    expect(describeProSource({ is_pro: false, pro_grant_kind: "promo", pro_grant_expires_at: past })).toBe("Free");
  });
});


// ---------------------------------------------------------------------------
// ADMIN1A — Premium provenance.
//
// The rule under test: Admin may never assert a Stripe subscription it cannot
// evidence. `profiles` records no Stripe identifier and `check-subscription` is
// self-scoped, so a bare `is_pro = true` on somebody else's row is LEGACY.
// ---------------------------------------------------------------------------

describe("describePremiumProvenance — source resolution", () => {
  const grant = (kind: string, expires: string | null = null) => ({
    is_pro: false,
    pro_grant_kind: kind,
    pro_grant_expires_at: expires,
  });

  it("resolves each canonical grant kind to its own source", () => {
    expect(describePremiumProvenance(grant("playtest")).source).toBe("playtest-grant");
    expect(describePremiumProvenance(grant("playtest")).sourceLabel).toBe("Playtest grant");
    expect(describePremiumProvenance(grant("manual")).source).toBe("manual-grant");
    expect(describePremiumProvenance(grant("manual")).sourceLabel).toBe("Manual grant");
    expect(describePremiumProvenance(grant("promo")).source).toBe("promo-grant");
    expect(describePremiumProvenance(grant("promo")).sourceLabel).toBe("Promo grant");
    // `gift` is written by redeem-gift, never by the admin form, but it must
    // still RENDER when present.
    expect(describePremiumProvenance(grant("gift")).source).toBe("gift-grant");
    expect(describePremiumProvenance(grant("gift")).sourceLabel).toBe("Gift grant");
  });

  it("resolves a verified Stripe-backed account to Stripe", () => {
    const p = describePremiumProvenance({ is_pro: true }, { stripeVerified: true });
    expect(p.source).toBe("stripe");
    expect(p.sourceLabel).toBe("Stripe");
    expect(p.stripe.verified).toBe(true);
    expect(p.stripe.label).toBe("Active subscription");
    expect(p.caution).toBeNull();
  });

  it("resolves a raw legacy is_pro with no provable Stripe and no grant to Legacy Premium", () => {
    const p = describePremiumProvenance({ is_pro: true });
    expect(p.effectivePremium).toBe(true);
    expect(p.source).toBe("legacy");
    expect(p.sourceLabel).toBe("Legacy Premium");
    expect(p.stripe.flagged).toBe(true);
    expect(p.stripe.verified).toBe(false);
    expect(p.stripe.label).not.toContain("Active");
    expect(p.grant.present).toBe(false);
    expect(p.caution).toBeTruthy();
  });

  it("resolves no entitlement to Free", () => {
    const p = describePremiumProvenance({ is_pro: false });
    expect(p.effectivePremium).toBe(false);
    expect(p.source).toBe("free");
    expect(p.sourceLabel).toBe("Free");
    expect(p.caution).toBeNull();
    expect(describePremiumProvenance(null).source).toBe("free");
    expect(describePremiumProvenance(undefined).source).toBe("free");
  });

  it("prefers the grant over a bare is_pro, so a written grant is what the admin sees", () => {
    // This is the COMBAT1 case: an account already legacy-Premium, then granted
    // playtest. Before ADMIN1A the screen said "Stripe subscription" either way.
    const before = describePremiumProvenance({ is_pro: true });
    const after = describePremiumProvenance({
      is_pro: true, pro_grant_kind: "playtest", pro_grant_expires_at: future,
    });
    expect(before.source).toBe("legacy");
    expect(after.source).toBe("playtest-grant");
    expect(after.source).not.toBe(before.source);
  });

  it("always renders both halves, so an empty grant row is visible as empty", () => {
    const p = describePremiumProvenance({ is_pro: true });
    expect(p.grant.present).toBe(false);
    expect(p.grant.kind).toBeNull();
    expect(p.stripe).toBeTruthy();
  });
});

describe("describePremiumProvenance — grant facts", () => {
  it("reports an expired grant as written-and-expired, not as absent", () => {
    // admin_set_pro_grant returns the raw columns without the validity CASE, so
    // a past expiry comes back as a real kind with effective_pro false. That is
    // an expired grant, never a failed write.
    const p = describePremiumProvenance({
      is_pro: false, pro_grant_kind: "playtest", pro_grant_expires_at: past,
    });
    expect(p.grant.present).toBe(true);
    expect(p.grant.expired).toBe(true);
    expect(p.grant.valid).toBe(false);
    expect(p.effectivePremium).toBe(false);
    expect(p.source).toBe("free");
    expect(describeGrant(p.grant)).toContain("expired");
  });

  it("carries expiry, reason and attribution when the row has them", () => {
    const g = readPremiumGrant({
      is_pro: false,
      pro_grant_kind: "playtest",
      pro_grant_expires_at: future,
      pro_grant_reason: "Combat / TeamSim internal playtest",
      pro_grant_granted_at: "2026-09-04T00:00:00Z",
      pro_grant_granted_by: "mitcherrman",
    });
    expect(g.valid).toBe(true);
    expect(g.reason).toBe("Combat / TeamSim internal playtest");
    expect(g.grantedAt).toBe("2026-09-04T00:00:00Z");
    expect(g.grantedBy).toBe("mitcherrman");
    expect(describeGrant(g)).toContain("expires");
  });

  it("renders a grant with no expiry as permanent", () => {
    const g = readPremiumGrant({ is_pro: false, pro_grant_kind: "manual", pro_grant_expires_at: null });
    expect(g.expired).toBe(false);
    expect(describeGrant(g)).toContain("no expiry");
  });

  it("tolerates a row that never selected the grant columns", () => {
    // The bug class this guards: a query that selects is_pro alone silently
    // reads as Stripe-only. It must not read as a grant, and it must not throw.
    const p = describePremiumProvenance({ is_pro: false });
    expect(p.grant.present).toBe(false);
    expect(describeGrant(p.grant)).toBeNull();
  });

  it("still renders an unrecognised kind a future writer may introduce", () => {
    const p = describePremiumProvenance({ is_pro: false, pro_grant_kind: "sweepstake" });
    expect(p.effectivePremium).toBe(true);
    expect(p.grant.rawKind).toBe("sweepstake");
    expect(p.grant.kind).toBeNull();
    expect(p.source).toBe("manual-grant");
  });
});
