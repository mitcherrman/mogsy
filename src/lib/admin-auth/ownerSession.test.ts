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

  describe("keep-alive after a failed attestation (S1-FIX F2)", () => {
    const MIN = 60_000;
    // Owner authorized through a trusted device at t=0 (attestation live until t=15).
    async function authorizedAtZero() {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(0);
      attest.mockResolvedValue(true);
      ownerState
        .mockResolvedValueOnce(ok({ isOwner: true, authorized: false, aal: "aal1" }))
        .mockResolvedValue(ok({ isOwner: true, authorized: true, aal: "aal1", trustedDevice: true }));
      bindOwnerSessionUser("owner");
      await vi.waitFor(() => expect(getOwnerSessionSnapshot().phase).toBe("authorized"));
      expect(attest).toHaveBeenCalledTimes(1);
      t0 = Date.now(); // waitFor advances the fake clock a little; the success was stamped by now
    }
    let t0 = 0;
    const tickAt = async (minutes: number) => {
      vi.setSystemTime(t0 + minutes * MIN);
      __ownerKeepAliveForTests();
      for (let i = 0; i < 4; i++) await settle();
    };

    it("a failed attempt at minute 10 is retried on the next tick (minute 11), not at minute 20", async () => {
      await authorizedAtZero();
      attest.mockResolvedValueOnce(false); // the minute-10 attempt fails
      await tickAt(10);
      expect(attest).toHaveBeenCalledTimes(2);
      expect(getOwnerSessionSnapshot().phase).toBe("authorized"); // the t=0 attestation is still live

      await tickAt(11); // next regular tick: still due, because nothing was stamped
      expect(attest).toHaveBeenCalledTimes(3);

      // The minute-11 attempt succeeded: the next renewal is due at minute 21, not before.
      await tickAt(12);
      await tickAt(20);
      expect(attest).toHaveBeenCalledTimes(3);
      await tickAt(21);
      expect(attest).toHaveBeenCalledTimes(4);
    });

    it("a successful attempt defers the next one a full interval", async () => {
      await authorizedAtZero();
      await tickAt(5); // too soon after the t=0 success
      expect(attest).toHaveBeenCalledTimes(1);
      await tickAt(10);
      expect(attest).toHaveBeenCalledTimes(2);
      await tickAt(11);
      await tickAt(19);
      expect(attest).toHaveBeenCalledTimes(2);
    });

    it("failed attempts never loop on their own: single-flight, one attempt per tick", async () => {
      await authorizedAtZero();
      let release!: (v: boolean) => void;
      attest.mockImplementationOnce(() => new Promise<boolean>((r) => { release = r; }));
      vi.setSystemTime(t0 + 10 * MIN);
      __ownerKeepAliveForTests();
      __ownerKeepAliveForTests(); // overlapping tick / focus while the first is in flight
      __ownerKeepAliveForTests();
      await settle();
      expect(attest).toHaveBeenCalledTimes(2);
      release(false);
      for (let i = 0; i < 6; i++) await settle(); // no tick: nothing retries by itself
      expect(attest).toHaveBeenCalledTimes(2);
      attest.mockResolvedValue(false);
      await tickAt(11);
      await tickAt(12);
      expect(attest).toHaveBeenCalledTimes(4); // exactly one per tick
    });
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
