// OWN1 — pure owner decision used by every owner-gated Edge Function, plus the
// response sanitizer that keeps raw recovery URLs out of admin responses.
import { describe, expect, it } from "vitest";
import {
  ADMIN_USER_ACTION_LEVEL,
  decideOwnerAccess,
  sanitizeAdminActionBody,
} from "../../../supabase/own1-staged/functions/_shared/owner-decision";
import { parseOwnerAuthState } from "@/lib/admin-auth/ownerAuth";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const base = { envOwnerId: OWNER, configuredOwnerId: OWNER };
const st = (o: Record<string, unknown>) => ({ is_owner: true, ...o });

describe("decideOwnerAccess", () => {
  it("rejects unverified callers with 401", () => {
    expect(decideOwnerAccess({ ...base, verifiedUserId: null, state: null, level: "trusted" })).toMatchObject({ status: 401 });
  });
  it("rejects a non-owner even if the RPC were to claim ownership", () => {
    expect(decideOwnerAccess({ ...base, verifiedUserId: OTHER, state: st({ authorized: true, aal: "aal2", fresh_aal2: true }), level: "trusted" }))
      .toMatchObject({ status: 403, code: "owner_required" });
  });
  it("fails closed when owner config is absent or inconsistent", () => {
    for (const cfg of [{ envOwnerId: undefined, configuredOwnerId: OWNER }, { envOwnerId: OWNER, configuredOwnerId: null }, { envOwnerId: OWNER, configuredOwnerId: OTHER }, { envOwnerId: "nope", configuredOwnerId: "nope" }]) {
      expect(decideOwnerAccess({ ...cfg, verifiedUserId: OWNER, state: st({ authorized: true, aal: "aal2", fresh_aal2: true }), level: "trusted" }))
        .toMatchObject({ status: 503, code: "owner_not_configured" });
    }
  });
  it("aal1 without a trusted device is step-up", () => {
    expect(decideOwnerAccess({ ...base, verifiedUserId: OWNER, state: st({ authorized: false, aal: "aal1" }), level: "trusted" }))
      .toMatchObject({ status: 403, code: "step_up_required" });
  });
  it("trusted device (aal1 + attestation) passes 'trusted' but NOT 'aal2' or 'fresh_aal2'", () => {
    const state = st({ authorized: true, aal: "aal1", trusted_device: true });
    expect(decideOwnerAccess({ ...base, verifiedUserId: OWNER, state, level: "trusted" })).toEqual({ ok: true });
    expect(decideOwnerAccess({ ...base, verifiedUserId: OWNER, state, level: "aal2" })).toMatchObject({ code: "step_up_required" });
    expect(decideOwnerAccess({ ...base, verifiedUserId: OWNER, state, level: "fresh_aal2" })).toMatchObject({ code: "step_up_required" });
  });
  it("stale aal2 fails fresh_aal2; fresh aal2 passes", () => {
    expect(decideOwnerAccess({ ...base, verifiedUserId: OWNER, state: st({ authorized: true, aal: "aal2", fresh_aal2: false }), level: "fresh_aal2" }))
      .toMatchObject({ code: "step_up_required" });
    expect(decideOwnerAccess({ ...base, verifiedUserId: OWNER, state: st({ authorized: true, aal: "aal2", fresh_aal2: true }), level: "fresh_aal2" }))
      .toEqual({ ok: true });
  });
  it("every mutating account action requires fresh aal2", () => {
    for (const a of ["send_password_reset", "resend_verification", "confirm_email", "ban_user", "unban_user"]) {
      expect(ADMIN_USER_ACTION_LEVEL[a]).toBe("fresh_aal2");
    }
  });
});

describe("sanitizeAdminActionBody", () => {
  it("never lets an action/recovery link through", () => {
    const out = sanitizeAdminActionBody({
      success: true, link: "https://x/verify?token=abc", action_link: "https://x", nested: { properties: { action_link: "https://x" }, url: "http://y" }, message: "ok",
    });
    expect(JSON.stringify(out)).not.toMatch(/https?:\/\//);
    expect(out).toMatchObject({ success: true, message: "ok" });
  });
});

describe("parseOwnerAuthState (frontend)", () => {
  it("accepts only a well-formed owner payload", () => {
    expect(parseOwnerAuthState(true).isOwner).toBe(false);
    expect(parseOwnerAuthState({ is_owner: "true" }).isOwner).toBe(false);
    expect(parseOwnerAuthState({ is_owner: true, authorized: true, aal: "aal1", fresh_aal2: true }).freshAal2).toBe(false);
    expect(parseOwnerAuthState({ is_owner: true, authorized: true, aal: "aal2", fresh_aal2: true })).toMatchObject({ isOwner: true, authorized: true, freshAal2: true });
  });
});
