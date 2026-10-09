// OWN1.1 — routine owner actions recover a lapsed attestation once; high-risk
// actions ask for fresh MFA for that action only and are never replayed
// unless the caller marks them idempotent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const ensure = vi.fn<() => Promise<boolean>>();
const stepUp = vi.fn<(reason: string) => Promise<boolean>>();
vi.mock("./ownerSession", () => ({
  refreshOwnerSession: () => refresh(),
  ensureOwnerAuthorized: () => ensure(),
}));
vi.mock("./ownerStepUpRequest", () => ({ requestOwnerStepUp: (r: string) => stepUp(r) }));

import { ownerActionNotice, runOwnerAction, stepUpNeedOf } from "./ownerAction";

const OK = { data: { ok: true }, error: null };
const TRUSTED_REFUSAL = { data: null, error: { message: "step_up_required", hint: "aal2_or_trusted_device" } };
const FRESH_REFUSAL = { data: null, error: { message: "step_up_required", hint: "fresh_aal2" } };
const edgeRefusal = () => ({
  data: null,
  error: { message: "Edge Function returned a non-2xx status code", context: new Response(JSON.stringify({ error: "step_up_required" }), { status: 403 }) },
});

beforeEach(() => {
  refresh.mockReset().mockResolvedValue({ freshAal2: false });
  ensure.mockReset().mockResolvedValue(true);
  stepUp.mockReset().mockResolvedValue(true);
});

describe("stepUpNeedOf", () => {
  it("reads RPC refusals and their level", async () => {
    expect(await stepUpNeedOf(TRUSTED_REFUSAL)).toBe("trusted");
    expect(await stepUpNeedOf(FRESH_REFUSAL)).toBe("fresh");
    expect(await stepUpNeedOf({ data: null, error: { message: "step_up_required", hint: "aal2" } })).toBe("fresh");
  });
  it("a refusal that names no level is unknown, not fresh (S1-FIX F1)", async () => {
    expect(await stepUpNeedOf({ data: null, error: { message: "step_up_required" } })).toBe("unknown");
    expect(await stepUpNeedOf({ data: null, error: { message: "step_up_required", hint: "something_else" } })).toBe("unknown");
    expect(await stepUpNeedOf({ data: { error: "step_up_required" }, error: null })).toBe("unknown");
  });
  it("reads Edge Function refusals from the HTTP body (no level hint → unknown)", async () => {
    expect(await stepUpNeedOf(edgeRefusal())).toBe("unknown");
  });
  it("ignores ordinary results and errors", async () => {
    expect(await stepUpNeedOf(OK)).toBeNull();
    expect(await stepUpNeedOf({ data: null, error: { message: "owner_required" } })).toBeNull();
    expect(await stepUpNeedOf({ data: null, error: { context: new Response("nope", { status: 500 }) } })).toBeNull();
  });
});

describe("runOwnerAction — routine (trusted)", () => {
  it("runs once with no step-up when the server accepts", async () => {
    const fn = vi.fn(async () => OK);
    expect(await runOwnerAction({ level: "trusted", reason: "x" }, fn)).toEqual({ status: "done", result: OK });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(stepUp).not.toHaveBeenCalled();
  });

  it("a lapsed attestation is re-attested and the call retried exactly once — no MFA", async () => {
    const fn = vi.fn().mockResolvedValueOnce(TRUSTED_REFUSAL).mockResolvedValueOnce(OK);
    expect(await runOwnerAction({ level: "trusted", reason: "x" }, fn)).toEqual({ status: "done", result: OK });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(stepUp).not.toHaveBeenCalled();
  });

  it("asks for MFA only when the trusted device cannot restore access; no replay unless idempotent", async () => {
    ensure.mockResolvedValue(false);
    const fn = vi.fn().mockResolvedValue(TRUSTED_REFUSAL);
    expect(await runOwnerAction({ level: "trusted", reason: "x" }, fn)).toEqual({ status: "verify_then_retry" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(stepUp).toHaveBeenCalledTimes(1);
  });

  it("an idempotent routine action is re-sent once after MFA", async () => {
    ensure.mockResolvedValue(false);
    const fn = vi.fn().mockResolvedValueOnce(TRUSTED_REFUSAL).mockResolvedValueOnce(OK);
    expect(await runOwnerAction({ level: "trusted", reason: "x", idempotent: true }, fn)).toEqual({ status: "done", result: OK });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("runOwnerAction — unknown-level refusals (S1-FIX F1)", () => {
  it("trusted action + Edge refusal with no hint → re-attest, one retry, no MFA when trust restores", async () => {
    const fn = vi.fn().mockResolvedValueOnce(edgeRefusal()).mockResolvedValueOnce(OK);
    expect(await runOwnerAction({ level: "trusted", reason: "x" }, fn)).toEqual({ status: "done", result: OK });
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(stepUp).not.toHaveBeenCalled();
  });

  it("trusted action + unknown refusal + failed trust restore → MFA path, not replayed", async () => {
    ensure.mockResolvedValue(false);
    const fn = vi.fn(async () => edgeRefusal());
    expect(await runOwnerAction({ level: "trusted", reason: "Loading" }, fn)).toEqual({ status: "verify_then_retry" });
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(stepUp).toHaveBeenCalledWith("Loading");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("trusted idempotent action + failed trust restore → MFA, then exactly one re-send", async () => {
    ensure.mockResolvedValue(false);
    const fn = vi.fn().mockResolvedValueOnce(edgeRefusal()).mockResolvedValueOnce(OK);
    expect(await runOwnerAction({ level: "trusted", reason: "x", idempotent: true }, fn)).toEqual({ status: "done", result: OK });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(stepUp).toHaveBeenCalledTimes(1);
  });

  it("trust restored but the retry is still refused → MFA, and no second retry even if idempotent", async () => {
    const fn = vi.fn(async () => edgeRefusal());
    expect(await runOwnerAction({ level: "trusted", reason: "x", idempotent: true }, fn)).toEqual({ status: "verify_then_retry" });
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2); // original + the one retry
    expect(stepUp).toHaveBeenCalledTimes(1);
  });

  it("a trusted-level action refused at the FRESH level goes straight to MFA (no re-attest)", async () => {
    const fn = vi.fn(async () => FRESH_REFUSAL);
    expect(await runOwnerAction({ level: "trusted", reason: "x" }, fn)).toEqual({ status: "verify_then_retry" });
    expect(ensure).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(stepUp).toHaveBeenCalledTimes(1);
  });

  it("fresh action + unknown refusal → fresh MFA, never downgraded to the trusted device", async () => {
    refresh.mockResolvedValue({ freshAal2: true }); // preflight passes, server still refuses
    const fn = vi.fn(async () => edgeRefusal());
    expect(await runOwnerAction({ level: "fresh", reason: "Ban" }, fn)).toEqual({ status: "verify_then_retry" });
    expect(ensure).not.toHaveBeenCalled();
    expect(stepUp).toHaveBeenCalledWith("Ban");
    expect(fn).toHaveBeenCalledTimes(1); // irreversible: not re-sent
  });

  it("retries at most once across every path (trusted and fresh, idempotent, always refused)", async () => {
    for (const level of ["trusted", "fresh"] as const) {
      for (const ensureOk of [true, false]) {
        ensure.mockReset().mockResolvedValue(ensureOk);
        refresh.mockReset().mockResolvedValue({ freshAal2: true });
        const fn = vi.fn(async () => edgeRefusal());
        await runOwnerAction({ level, reason: "x", idempotent: true }, fn);
        expect(fn.mock.calls.length).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("runOwnerAction — high risk (fresh)", () => {
  it("asks for MFA BEFORE the first call when the session is not fresh, then runs once", async () => {
    const order: string[] = [];
    stepUp.mockImplementation(async () => { order.push("mfa"); return true; });
    const fn = vi.fn(async () => { order.push("call"); return OK; });
    expect(await runOwnerAction({ level: "fresh", reason: "Ban" }, fn)).toEqual({ status: "done", result: OK });
    expect(order).toEqual(["mfa", "call"]);
    expect(stepUp).toHaveBeenCalledWith("Ban");
  });

  it("skips the prompt when the server already reports a fresh MFA", async () => {
    refresh.mockResolvedValue({ freshAal2: true });
    const fn = vi.fn(async () => OK);
    await runOwnerAction({ level: "fresh", reason: "Ban" }, fn);
    expect(stepUp).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a cancelled prompt runs nothing", async () => {
    stepUp.mockResolvedValue(false);
    const fn = vi.fn(async () => OK);
    const outcome = await runOwnerAction({ level: "fresh", reason: "Purge" }, fn);
    expect(outcome).toEqual({ status: "cancelled" });
    expect(fn).not.toHaveBeenCalled();
    expect(ownerActionNotice(outcome)).toMatch(/nothing was changed/i);
  });

  it("a server step-up refusal after the preflight is NOT replayed for an irreversible action", async () => {
    refresh.mockResolvedValue({ freshAal2: true });
    const fn = vi.fn(async () => edgeRefusal());
    const outcome = await runOwnerAction({ level: "fresh", reason: "Purge" }, fn);
    expect(outcome).toEqual({ status: "verify_then_retry" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(ensure).not.toHaveBeenCalled(); // a trusted device never satisfies fresh MFA
    expect(ownerActionNotice(outcome)).toMatch(/run the action again/i);
  });

  it("never retries more than once, even if the server keeps refusing", async () => {
    const fn = vi.fn(async () => FRESH_REFUSAL);
    await runOwnerAction({ level: "fresh", reason: "x", idempotent: true }, fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(stepUp).toHaveBeenCalledTimes(2); // preflight + one refusal, then stop
  });
});
