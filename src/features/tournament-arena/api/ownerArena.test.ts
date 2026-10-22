import { describe, expect, it, vi } from "vitest";

const ensureOwnerAuthorized = vi.fn(async () => true);
const requestOwnerStepUp = vi.fn(async () => false);
vi.mock("@/lib/admin-auth/ownerSession", () => ({
  ensureOwnerAuthorized: () => ensureOwnerAuthorized(),
  refreshOwnerSession: async () => ({ freshAal2: true }),
}));
vi.mock("@/lib/admin-auth/ownerStepUpRequest", () => ({ requestOwnerStepUp: () => requestOwnerStepUp() }));

import { ArenaApiError } from "./arenaApi";
import { ownerArenaCall } from "./ownerArena";

const refused = () => new ArenaApiError("backend", 403, "x", "ARENA_ORGANIZER_REQUIRED");

describe("ownerArenaCall", () => {
  it("re-attests once after an organizer refusal and re-sends the SAME press", async () => {
    const seen: string[] = [];
    const actionId = "lock_same_press_1";
    let n = 0;
    const r = await ownerArenaCall("Locking", async () => {
      seen.push(actionId);
      if (n++ === 0) throw refused();
      return "ok";
    });
    expect(r).toEqual({ status: "done", value: "ok" });
    expect(ensureOwnerAuthorized).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([actionId, actionId]);
  });

  it("asks for MFA when re-attesting does not restore access, and changes nothing if cancelled", async () => {
    const r = await ownerArenaCall("Starting", async () => { throw refused(); });
    expect(requestOwnerStepUp).toHaveBeenCalled();
    expect(r.status).toBe("not_run");
  });

  it("returns any other refusal as copy, without a step-up", async () => {
    requestOwnerStepUp.mockClear();
    const r = await ownerArenaCall("Starting", async () => { throw new ArenaApiError("backend", 409, "x", "ARENA_WRONG_STATUS"); });
    expect(r).toMatchObject({ status: "failed" });
    expect(r.status === "failed" && r.notice).toMatch(/moved on/);
    expect(requestOwnerStepUp).not.toHaveBeenCalled();
  });
});
