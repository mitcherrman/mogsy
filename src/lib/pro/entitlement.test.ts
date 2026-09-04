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
  it("names both sources when both are live", () => {
    const text = describeProSource({ is_pro: true, pro_grant_kind: "playtest", pro_grant_expires_at: future });
    expect(text).toContain("Stripe subscription");
    expect(text).toContain("playtest grant");
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
