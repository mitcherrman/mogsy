import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GLOBAL PREMIUM ACCESS — the admin-controlled temporary access override.
 *
 *     effectiveAccess = globalPremiumAccess || (stripePro || validGrant)
 *
 * Three ideas are kept apart here, and the tests are organised around them:
 *
 *   ACCESS      what a caller may DO now. Global, reversible, one row in
 *               `app_settings`. Owned by nobody.
 *   ENTITLEMENT WHY they may. Per-account, on `profiles`, reported unchanged
 *               by `stripePro` / `grantKind` however the override is set.
 *   OWNERSHIP   what they have SINCE ACQUIRED. Written by whichever feature
 *               granted it, derived from neither of the above — which is why
 *               turning the override off is not a revocation.
 *
 * The frontend is presentation; the backend re-resolves the same override at
 * services/pro_status.get_pro_status for every gate (see
 * quiz/tests/test_global_premium_access.py in the backend repo).
 */

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

import {
  fetchGlobalPremiumAccess,
  fetchProEntitlement,
  isEffectivePro,
  isEffectiveProForSelf,
} from "./entitlement";
import { POLICY_KEYS } from "@/lib/platform-policy/policy";

const DAY = 86400000;
const future = new Date(Date.now() + 30 * DAY).toISOString();

/** Stub the `app_settings` read the override resolves through. */
function settings(result: { data?: unknown; error?: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  from.mockReturnValue({ select });
  return { select, eq, maybeSingle };
}

function globalAccess(enabled: boolean) {
  return settings({ data: { value: { enabled } } });
}

/** Stub the PT1.4 entitlement RPC. */
function entitlement(row: Record<string, unknown> | null) {
  rpc.mockResolvedValue({ data: row ? [row] : [], error: null });
}

const FREE_ROW = { effective_pro: false, stripe_pro: false, grant_kind: null };
const PAID_ROW = { effective_pro: true, stripe_pro: true, grant_kind: null };

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

// ---------------------------------------------------------------------------
// The four-cell truth table
// ---------------------------------------------------------------------------

describe("effective access truth table", () => {
  it("Free user, global OFF → Free", async () => {
    globalAccess(false);
    entitlement(FREE_ROW);
    const result = await fetchProEntitlement();
    expect(result?.effectivePro).toBe(false);
    expect(result?.globalAccess).toBe(false);
  });

  it("paid Premium user, global OFF → Premium", async () => {
    globalAccess(false);
    entitlement(PAID_ROW);
    const result = await fetchProEntitlement();
    expect(result?.effectivePro).toBe(true);
    expect(result?.stripePro).toBe(true);
  });

  it("Free user, global ON → Premium, and says so is temporary", async () => {
    globalAccess(true);
    entitlement(FREE_ROW);
    const result = await fetchProEntitlement();
    expect(result?.effectivePro).toBe(true);
    // The provenance stays honest: nothing about this account changed.
    expect(result?.globalAccess).toBe(true);
    expect(result?.stripePro).toBe(false);
    expect(result?.grantKind).toBeNull();
  });

  it("paid Premium user, global ON → Premium, still by subscription", async () => {
    globalAccess(true);
    entitlement(PAID_ROW);
    const result = await fetchProEntitlement();
    expect(result?.effectivePro).toBe(true);
    expect(result?.stripePro).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Turning it off restores normal evaluation
// ---------------------------------------------------------------------------

describe("turning the override off", () => {
  it("returns a Free user to Free with no other state changing", async () => {
    entitlement(FREE_ROW);
    globalAccess(true);
    expect((await fetchProEntitlement())?.effectivePro).toBe(true);

    globalAccess(false);
    const after = await fetchProEntitlement();
    expect(after?.effectivePro).toBe(false);
    expect(after?.globalAccess).toBe(false);
    // Their real entitlement was never touched, so it reads exactly as before.
    expect(after?.stripePro).toBe(false);
    expect(after?.grantKind).toBeNull();
  });

  it("leaves a paying subscriber Premium", async () => {
    entitlement(PAID_ROW);
    globalAccess(false);
    const after = await fetchProEntitlement();
    expect(after?.effectivePro).toBe(true);
    expect(after?.stripePro).toBe(true);
  });

  it("leaves a comped grant holder Premium", async () => {
    entitlement({
      effective_pro: true,
      stripe_pro: false,
      grant_kind: "playtest",
      grant_expires_at: future,
    });
    globalAccess(false);
    const after = await fetchProEntitlement();
    expect(after?.effectivePro).toBe(true);
    expect(after?.grantKind).toBe("playtest");
  });
});

// ---------------------------------------------------------------------------
// It is ACCESS, never ENTITLEMENT — nothing is written
// ---------------------------------------------------------------------------

describe("the override never mutates entitlement", () => {
  it("only ever READS one known settings key, and writes nothing", async () => {
    const stub = globalAccess(true);
    entitlement(FREE_ROW);
    await fetchProEntitlement();

    expect(from).toHaveBeenCalledWith("app_settings");
    expect(stub.select).toHaveBeenCalledWith("value");
    // A fixed key the module constructs itself: never caller-supplied, and
    // never any other row.
    expect(stub.eq).toHaveBeenCalledWith("key", POLICY_KEYS.globalPremiumAccess);
    // No write verb is ever reached — the stub exposes none, so a call to
    // update/upsert/insert/delete would have thrown.
    const table = from.mock.results[0].value as Record<string, unknown>;
    expect(Object.keys(table)).toEqual(["select"]);
  });

  it("resolves entitlement through the canonical RPC either way", async () => {
    globalAccess(true);
    entitlement(FREE_ROW);
    await fetchProEntitlement();
    // Still the PT1.4 resolver, not a raw is_pro read and not a bypass.
    expect(rpc).toHaveBeenCalledWith("my_pro_entitlement");
  });

  it("declares no Stripe vocabulary in the accessor at all", async () => {
    // The module can neither create nor modify a subscription because it
    // holds no Stripe surface: the only Stripe word it knows is the name of
    // the READ-ONLY provenance field the RPC hands back.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/pro/entitlement.ts", "utf8"),
    );
    expect(source).not.toMatch(/functions\.invoke/);
    expect(source).not.toMatch(/create-checkout|customer-portal|stripe-webhook/);
    expect(source).not.toMatch(/\.update\(|\.upsert\(|\.insert\(|\.delete\(/);
  });
});

// ---------------------------------------------------------------------------
// Ownership survives the window closing
// ---------------------------------------------------------------------------

describe("persistent acquisitions outlive the access window", () => {
  it("an unlock stored during the window is unchanged when it closes", async () => {
    // A cosmetic acquired while global access was ON. It is stored on the
    // account by the feature that granted it — this module has no hand in it.
    const acquired = {
      profile_frame: "gold-frame",
      custom_theme: "midnight",
      is_pro: false,
      pro_grant_kind: null,
    };

    entitlement(FREE_ROW);
    globalAccess(true);
    expect((await fetchProEntitlement())?.effectivePro).toBe(true);

    globalAccess(false);
    expect((await fetchProEntitlement())?.effectivePro).toBe(false);

    // Access closed; the stored acquisition is byte-for-byte what it was.
    expect(acquired).toEqual({
      profile_frame: "gold-frame",
      custom_theme: "midnight",
      is_pro: false,
      pro_grant_kind: null,
    });
  });

  it("has no revocation surface: entitlement never reads or clears an acquisition", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/pro/entitlement.ts", "utf8"),
    );
    // The columns Mogzy actually stores acquisitions in. The entitlement
    // module names none of them, so there is nothing here that could clear one
    // when the window closes — and no revocation pass to write.
    for (const ownedColumn of ["profile_frame", "custom_theme", "swipe_animation"]) {
      expect(source).not.toContain(ownedColumn);
    }
  });
});

// ---------------------------------------------------------------------------
// Fail-closed, and the pure rule stays pure
// ---------------------------------------------------------------------------

describe("failure direction", () => {
  it("an errored settings read means OFF, not everyone-Premium", async () => {
    settings({ error: { message: "network" } });
    entitlement(FREE_ROW);
    expect((await fetchProEntitlement())?.effectivePro).toBe(false);
  });

  it("an absent or malformed row means OFF", async () => {
    for (const data of [null, { value: null }, { value: {} }, { value: { enabled: "yes" } }]) {
      settings({ data });
      expect(await fetchGlobalPremiumAccess()).toBe(false);
    }
  });

  it("a thrown client means OFF rather than an unhandled rejection", async () => {
    from.mockImplementation(() => {
      throw new Error("client exploded");
    });
    expect(await fetchGlobalPremiumAccess()).toBe(false);
  });

  it("an unresolvable entitlement stays unknown, and is not made Premium", async () => {
    globalAccess(false);
    rpc.mockResolvedValue({ data: null, error: { message: "rpc down" } });
    expect(await fetchProEntitlement()).toBeNull();
  });
});

describe("the pure rule is left pure for admin tooling", () => {
  it("isEffectivePro ignores the override entirely", () => {
    // Admin lists OTHER accounts with this. A global access window is not
    // something those accounts have, and showing it as if it were would be the
    // exact provenance lie ADMIN1A removed.
    expect(isEffectivePro({ is_pro: false, pro_grant_kind: null })).toBe(false);
    expect(isEffectivePro({ is_pro: true })).toBe(true);
  });

  it("isEffectiveProForSelf is the self-gate that folds it in", () => {
    const free = { is_pro: false, pro_grant_kind: null };
    const paid = { is_pro: true };
    expect(isEffectiveProForSelf(free, false)).toBe(false);
    expect(isEffectiveProForSelf(free, true)).toBe(true);
    expect(isEffectiveProForSelf(paid, false)).toBe(true);
    expect(isEffectiveProForSelf(paid, true)).toBe(true);
    // And it never invents entitlement for a missing row when off.
    expect(isEffectiveProForSelf(null, false)).toBe(false);
  });
});
