// S1-FIX — owner_auth_state is bounded by a client timeout (F3), and a
// step-up refusal that names no level is "unknown" (F1).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type RpcReply = { data: unknown; error: unknown };
const rpc = vi.fn<(fn: string, args?: unknown) => unknown>();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (fn: string, args?: unknown) => rpc(fn, args) } }));
vi.mock("./ownerDevice", () => ({ attestStoredDevice: async () => false }));

import { fetchOwnerAuthStateResult, OWNER_AUTH_STATE_TIMEOUT_MS, stepUpKind } from "./ownerAuth";
import {
  __resetOwnerSessionForTests,
  bindOwnerSessionUser,
  getOwnerSessionSnapshot,
  refreshOwnerSession,
  subscribeOwnerSession,
} from "./ownerSession";

const OWNER = { is_owner: true, authorized: true, aal: "aal2", trusted_device: false, fresh_aal2: false };

/** A PostgREST-like builder that never answers until released. */
function hangingRpc() {
  let release!: (v: RpcReply) => void;
  const reply = new Promise<RpcReply>((r) => { release = r; });
  let signal: AbortSignal | null = null;
  const builder = {
    abortSignal(s: AbortSignal) { signal = s; return builder; },
    then: (res: (v: RpcReply) => unknown, rej?: (e: unknown) => unknown) => reply.then(res, rej),
  };
  return { builder, release, signal: () => signal };
}

let unsubscribe: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  rpc.mockReset();
  __resetOwnerSessionForTests();
  unsubscribe = subscribeOwnerSession(() => {});
});
afterEach(() => {
  unsubscribe();
  vi.useRealTimers();
});

describe("stepUpKind", () => {
  it("names the level only when the server did", () => {
    expect(stepUpKind({ message: "step_up_required", hint: "aal2_or_trusted_device" })).toBe("trusted");
    expect(stepUpKind({ message: "step_up_required", hint: "fresh_aal2" })).toBe("fresh");
    expect(stepUpKind({ message: "step_up_required", hint: "aal2" })).toBe("fresh");
    expect(stepUpKind({ message: "step_up_required" })).toBe("unknown");
    expect(stepUpKind({ error: "step_up_required" })).toBe("unknown");
  });
});

describe("fetchOwnerAuthStateResult timeout (S1-FIX F3)", () => {
  it("answers normally inside the timeout", async () => {
    rpc.mockReturnValue(Promise.resolve({ data: OWNER, error: null }));
    await expect(fetchOwnerAuthStateResult()).resolves.toMatchObject({ ok: true, state: { isOwner: true, authorized: true } });
  });

  it("a hung request becomes { ok: false } after the timeout and is aborted", async () => {
    const h = hangingRpc();
    rpc.mockReturnValue(h.builder);
    let settled: unknown = "pending";
    void fetchOwnerAuthStateResult().then((r) => { settled = r; });
    await vi.advanceTimersByTimeAsync(OWNER_AUTH_STATE_TIMEOUT_MS - 1);
    expect(settled).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual({ ok: false });
    expect(h.signal()?.aborted).toBe(true);
    expect(OWNER_AUTH_STATE_TIMEOUT_MS).toBe(8_000);
  });

  it("also times out a plain promise that has no abortSignal", async () => {
    rpc.mockReturnValue(new Promise(() => {}));
    const p = fetchOwnerAuthStateResult();
    await vi.advanceTimersByTimeAsync(OWNER_AUTH_STATE_TIMEOUT_MS);
    await expect(p).resolves.toEqual({ ok: false });
  });

  it("a first check that hangs leaves Admin 'unavailable' (not blank) and a late reply changes nothing", async () => {
    const h = hangingRpc();
    rpc.mockReturnValue(h.builder);
    bindOwnerSessionUser("owner");
    expect(getOwnerSessionSnapshot().phase).toBe("loading");
    await vi.advanceTimersByTimeAsync(OWNER_AUTH_STATE_TIMEOUT_MS);
    expect(getOwnerSessionSnapshot()).toMatchObject({ phase: "unavailable", authorized: false, refreshing: false });

    const before = getOwnerSessionSnapshot();
    h.release({ data: OWNER, error: null }); // the stale reply arrives after the timeout
    await vi.advanceTimersByTimeAsync(0);
    expect(getOwnerSessionSnapshot()).toBe(before);
  });

  it("an established owner stays displayed (stale) when a refresh hangs; the late refusal does not land", async () => {
    rpc.mockReturnValueOnce(Promise.resolve({ data: OWNER, error: null }));
    bindOwnerSessionUser("owner");
    await vi.advanceTimersByTimeAsync(0);
    expect(getOwnerSessionSnapshot().phase).toBe("authorized");

    const h = hangingRpc();
    rpc.mockReturnValueOnce(h.builder);
    const refresh = refreshOwnerSession();
    await vi.advanceTimersByTimeAsync(OWNER_AUTH_STATE_TIMEOUT_MS);
    await refresh;
    expect(getOwnerSessionSnapshot()).toMatchObject({ phase: "authorized", stale: true, refreshing: false });

    const before = getOwnerSessionSnapshot();
    h.release({ data: { is_owner: true, authorized: false, aal: "aal1" }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(getOwnerSessionSnapshot()).toBe(before);

    // The next real answer still wins: the timeout only bounds waiting, proof decides.
    rpc.mockReturnValueOnce(Promise.resolve({ data: { is_owner: true, authorized: false, aal: "aal1" }, error: null }));
    await refreshOwnerSession();
    expect(getOwnerSessionSnapshot()).toMatchObject({ phase: "needs_mfa", stale: false });
  });
});
