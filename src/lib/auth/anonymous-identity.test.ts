/**
 * USERS1 — a page visit is not a user account.
 *
 * This suite exists because the opposite was true for months and nothing
 * noticed: production reached ~5,000 rows in auth.users for a product about
 * three people had used, because five different code paths minted an identity
 * on page load. The properties below are the ones that make that impossible to
 * reintroduce accidentally.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const signInAnonymously = vi.fn(async () => ({
  data: { session: { access_token: "anon-token", user: { id: "u-anon", is_anonymous: true } } },
  error: null,
}));
let session: { access_token: string } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session } }),
      signInAnonymously,
    },
  },
}));

import {
  ensureBackendAuthToken,
  getBackendAuthHeaders,
  getExistingBackendAuthToken,
} from "@/lib/backend-auth";
import { ensureAnonymousIdentity, getExistingSession, resetAnonymousIdentityForTests } from "./anonymous-identity";

beforeEach(() => {
  signInAnonymously.mockClear();
  session = null;
  resetAnonymousIdentityForTests();
});

describe("reads never mint", () => {
  it("getExistingBackendAuthToken returns null for a visitor with no identity, and creates none", async () => {
    expect(await getExistingBackendAuthToken()).toBeNull();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("getBackendAuthHeaders sends nothing, and creates nothing, when there is no session", async () => {
    expect(await getBackendAuthHeaders()).toEqual({});
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("getExistingSession is a pure read", async () => {
    expect(await getExistingSession()).toBeNull();
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("uses the session the browser already has, without minting a second one", async () => {
    session = { access_token: "real-token" };
    expect(await getExistingBackendAuthToken()).toBe("real-token");
    expect(await getBackendAuthHeaders()).toEqual({ Authorization: "Bearer real-token" });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});

describe("writes mint, once, at the boundary", () => {
  it("getBackendAuthHeaders({ mint }) establishes an identity when there is none", async () => {
    expect(await getBackendAuthHeaders({ mint: "ranked_write" })).toEqual({
      Authorization: "Bearer anon-token",
    });
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("ensureBackendAuthToken establishes one too", async () => {
    expect(await ensureBackendAuthToken()).toBe("anon-token");
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it("does not mint a second identity for a visitor who already has one", async () => {
    session = { access_token: "real-token" };
    expect(await getBackendAuthHeaders({ mint: "quiz_write" })).toEqual({
      Authorization: "Bearer real-token",
    });
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("is single-flight: concurrent writes at the start of a quiz share ONE identity", async () => {
    // The specific failure this guards: create-session and submit-answer fire
    // within milliseconds of each other, and without the guard each one
    // reaches signInAnonymously and mints a separate throwaway account for the
    // same visitor.
    const results = await Promise.all([
      ensureAnonymousIdentity("quiz_write"),
      ensureAnonymousIdentity("quiz_write"),
      ensureAnonymousIdentity("quiz_write"),
    ]);
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r?.access_token).toBe("anon-token");
  });
});
