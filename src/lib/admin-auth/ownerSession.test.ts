// OWN1.1 — the shared owner session: stable through rechecks, reset on user
// change, and kept alive for trusted-device (aal1) owners.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerAuthStateResult } from "./ownerAuth";

const ownerState = vi.fn<() => Promise<OwnerAuthStateResult>>();
const attest = vi.fn<() => Promise<boolean>>();
vi.mock("./ownerAuth", async (orig) => ({
  ...(await orig<typeof import("./ownerAuth")>()),
  fetchOwnerAuthStateResult: () => ownerState(),
}));
vi.mock("./ownerDevice", () => ({ attestStoredDevice: () => attest() }));

import {
  __ownerKeepAliveForTests,
  __resetOwnerSessionForTests,
  bindOwnerSessionUser,
  ensureOwnerAuthorized,
  getOwnerSessionSnapshot,
  REATTEST_INTERVAL_MS,
  refreshOwnerSession,
  subscribeOwnerSession,
} from "./ownerSession";

const ok = (s: Partial<{ isOwner: boolean; authorized: boolean; aal: "aal1" | "aal2" | null; trustedDevice: boolean; freshAal2: boolean }>): OwnerAuthStateResult => ({
  ok: true,
  state: { isOwner: false, authorized: false, aal: null, trustedDevice: false, freshAal2: false, ...s },
});
const settle = () => new Promise((r) => setTimeout(r, 0));
let unsubscribe: () => void;

beforeEach(() => {
  __resetOwnerSessionForTests();
  ownerState.mockReset();
  attest.mockReset().mockResolvedValue(false);
  unsubscribe = subscribeOwnerSession(() => {});
});
afterEach(() => {
  unsubscribe();
  vi.useRealTimers();
});

describe("ownerSession", () => {
  it("a signed-out binding never asks the server", () => {
    bindOwnerSessionUser(null);
    expect(getOwnerSessionSnapshot().phase).toBe("signed_out");
    expect(ownerState).not.toHaveBeenCalled();
  });

  it("legacy role rows are irrelevant: only owner_auth_state decides", async () => {
    ownerState.mockResolvedValue(ok({ isOwner: false, authorized: false }));
    bindOwnerSessionUser("former-master-admin");
    await settle();
    expect(getOwnerSessionSnapshot().phase).toBe("non_owner");
    expect(attest).not.toHaveBeenCalled(); // non-owners never present a device token
  });

  it("binding the same user again is free (token refresh)", async () => {
    ownerState.mockResolvedValue(ok({ isOwner: true, authorized: true, aal: "aal2" }));
    bindOwnerSessionUser("owner");
    await settle();
    bindOwnerSessionUser("owner");
    bindOwnerSessionUser("owner");
    await settle();
    expect(ownerState).toHaveBeenCalledTimes(1);
  });

  it("concurrent refreshes share one request", async () => {
    ownerState.mockResolvedValue(ok({ isOwner: true, authorized: true, aal: "aal2" }));
    bindOwnerSessionUser("owner");
    await Promise.all([refreshOwnerSession(), refreshOwnerSession(), refreshOwnerSession()]);
    expect(ownerState).toHaveBeenCalledTimes(1);
  });

  it("an owner at aal1 with a revoked/absent device needs MFA after one attempt", async () => {
    ownerState.mockResolvedValue(ok({ isOwner: true, authorized: false, aal: "aal1" }));
    bindOwnerSessionUser("owner");
    await settle();
    expect(getOwnerSessionSnapshot().phase).toBe("needs_mfa");
    expect(attest).toHaveBeenCalledTimes(1);
  });

  it("a server refusal demotes even an established owner (proof wins)", async () => {
    ownerState.mockResolvedValueOnce(ok({ isOwner: true, authorized: true, aal: "aal1", trustedDevice: true }));
    bindOwnerSessionUser("owner");
    await settle();
    ownerState.mockResolvedValue(ok({ isOwner: true, authorized: false, aal: "aal1" }));
    await refreshOwnerSession();
    expect(getOwnerSessionSnapshot().phase).toBe("needs_mfa");
  });

  it("a first check that cannot reach Supabase is unavailable, not authorized", async () => {
    ownerState.mockResolvedValue({ ok: false });
    bindOwnerSessionUser("owner");
    await settle();
    const s = getOwnerSessionSnapshot();
    expect(s.phase).toBe("unavailable");
    expect(s.authorized).toBe(false);
  });

  it("a stale user's late answer never lands on the next user", async () => {
    let release!: (v: OwnerAuthStateResult) => void;
    ownerState.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    bindOwnerSessionUser("owner");
    ownerState.mockResolvedValue(ok({ isOwner: false }));
    bindOwnerSessionUser("other");
    release(ok({ isOwner: true, authorized: true, aal: "aal2" }));
    await settle();
    await settle();
    expect(getOwnerSessionSnapshot()).toMatchObject({ userId: "other", phase: "non_owner", authorized: false });
  });

  it("keeps an attestation-backed owner alive before the 15-minute expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    attest.mockResolvedValue(true);
    ownerState
      .mockResolvedValueOnce(ok({ isOwner: true, authorized: false, aal: "aal1" }))
      .mockResolvedValue(ok({ isOwner: true, authorized: true, aal: "aal1", trustedDevice: true }));
    bindOwnerSessionUser("owner");
    await vi.waitFor(() => expect(getOwnerSessionSnapshot().phase).toBe("authorized"));
    expect(attest).toHaveBeenCalledTimes(1);

    __ownerKeepAliveForTests(); // too soon: nothing
    await settle();
    expect(attest).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + REATTEST_INTERVAL_MS + 1);
    __ownerKeepAliveForTests();
    await vi.waitFor(() => expect(attest).toHaveBeenCalledTimes(2));
    expect(REATTEST_INTERVAL_MS).toBeLessThan(15 * 60_000);
    expect(getOwnerSessionSnapshot().phase).toBe("authorized");
  });

  it("an aal2 owner needs no keep-alive attestation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    ownerState.mockResolvedValue(ok({ isOwner: true, authorized: true, aal: "aal2" }));
    bindOwnerSessionUser("owner");
    await vi.waitFor(() => expect(getOwnerSessionSnapshot().phase).toBe("authorized"));
    vi.setSystemTime(Date.now() + REATTEST_INTERVAL_MS * 3);
    __ownerKeepAliveForTests();
    await settle();
    expect(attest).not.toHaveBeenCalled();
  });

  it("ensureOwnerAuthorized re-attests once, single-flight, and reports the server's answer", async () => {
    ownerState.mockResolvedValue(ok({ isOwner: true, authorized: true, aal: "aal1", trustedDevice: true }));
    bindOwnerSessionUser("owner");
    await settle();
    attest.mockClear();
    attest.mockResolvedValue(true);
    const results = await Promise.all([ensureOwnerAuthorized(), ensureOwnerAuthorized()]);
    expect(results).toEqual([true, true]);
    expect(attest).toHaveBeenCalledTimes(1);

    attest.mockResolvedValue(false);
    ownerState.mockResolvedValue(ok({ isOwner: true, authorized: false, aal: "aal1" }));
    expect(await ensureOwnerAuthorized()).toBe(false);
  });

  it("forgets everything when nothing is subscribed", async () => {
    ownerState.mockResolvedValue(ok({ isOwner: true, authorized: true, aal: "aal2" }));
    bindOwnerSessionUser("owner");
    await settle();
    unsubscribe();
    expect(getOwnerSessionSnapshot()).toMatchObject({ userId: null, phase: "loading", authorized: false });
    unsubscribe = subscribeOwnerSession(() => {});
  });
});
