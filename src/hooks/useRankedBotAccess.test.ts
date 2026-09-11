/**
 * RB1 — the capability behind the Match-with-Bot control.
 *
 * `useRankedBotAccess` answers ONE question — may this viewer be OFFERED Bot
 * Ranked? — from two independent facts it does not expose: an admin role, and
 * PT1.4 effective Premium entitlement (Stripe OR a valid manual/playtest
 * grant, composed in Postgres). Because it asks the live authority rather than
 * a stored tag, an account made Premium by a temporary grant qualifies for
 * exactly as long as that grant stands and stops qualifying when it lapses,
 * with nothing here needing to change.
 *
 * It GRANTS nothing. The server re-decides on every join. What it must get
 * right is the failure direction: unresolved is not Free and is not Premium,
 * and neither of them may draw the control.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  roles: { isAdmin: false, loading: false },
  entitlement: vi.fn(),
}));

vi.mock("@/hooks/useAdminRoles", () => ({ useAdminRoles: () => h.roles }));
vi.mock("@/lib/pro/entitlement", () => ({
  fetchProEntitlement: () => h.entitlement(),
}));

import { useRankedBotAccess } from "./useRankedBotAccess";

const FREE = { effectivePro: false };
const PREMIUM = { effectivePro: true };

beforeEach(() => {
  h.roles.isAdmin = false;
  h.roles.loading = false;
  h.entitlement.mockResolvedValue(FREE);
});
afterEach(() => vi.clearAllMocks());

async function settle() {
  const { result } = renderHook(() => useRankedBotAccess());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe("who may be offered Bot Ranked", () => {
  it("a Premium non-admin may", async () => {
    h.entitlement.mockResolvedValue(PREMIUM);
    const result = await settle();
    expect(result.current.canPlayRankedBot).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });

  it("an admin may, whatever their entitlement is", async () => {
    h.roles.isAdmin = true;
    const result = await settle();
    expect(result.current.canPlayRankedBot).toBe(true);
  });

  it("a Free non-admin may not", async () => {
    const result = await settle();
    expect(result.current.canPlayRankedBot).toBe(false);
  });
});

describe("it fails closed", () => {
  it("says no while the answer is still arriving", () => {
    h.entitlement.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRankedBotAccess());
    // Loading is not a maybe that gets rendered optimistically: the control
    // must never appear and then be taken away.
    expect(result.current.loading).toBe(true);
    expect(result.current.canPlayRankedBot).toBe(false);
  });

  it("says no while the ROLE answer is still arriving", () => {
    h.roles.loading = true;
    h.entitlement.mockResolvedValue(PREMIUM);
    const { result } = renderHook(() => useRankedBotAccess());
    expect(result.current.loading).toBe(true);
    expect(result.current.canPlayRankedBot).toBe(false);
  });

  it("treats an UNRESOLVED entitlement as no, not as Premium", async () => {
    // `fetchProEntitlement` answers null when the lookup could not be made at
    // all — a distinct state from a resolved Free. Both refuse the control;
    // only the server distinguishes them, and it answers 503 rather than 403.
    h.entitlement.mockResolvedValue(null);
    const result = await settle();
    expect(result.current.canPlayRankedBot).toBe(false);
  });

  it("still lets an ADMIN through an entitlement outage", async () => {
    h.roles.isAdmin = true;
    h.entitlement.mockResolvedValue(null);
    const result = await settle();
    expect(result.current.canPlayRankedBot).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RB3.1 — the admin access-point regression.
//
// The control disappeared for admin in production. The proximate cause was a
// prop rename that never reached `RankedQueueView` (pinned in that component's
// own tests), but the hook carried a second, independent way to lose staff
// access: it made admin WAIT on — and in one case depend on — an entitlement
// answer that admin does not need. These cases pin the separation.
// ---------------------------------------------------------------------------
describe("admin access does not pass through entitlement", () => {
  it("is offered before the entitlement lookup has answered at all", () => {
    h.roles.isAdmin = true;
    h.entitlement.mockReturnValue(new Promise(() => {}));   // never settles
    const { result } = renderHook(() => useRankedBotAccess());
    // No await: the very first render already offers it.
    expect(result.current.loading).toBe(false);
    expect(result.current.canPlayRankedBot).toBe(true);
  });

  it("survives an entitlement lookup that THROWS", async () => {
    h.roles.isAdmin = true;
    h.entitlement.mockRejectedValue(new Error("rpc down"));
    const result = await settle();
    expect(result.current.canPlayRankedBot).toBe(true);
  });

  it("survives an entitlement that resolves to a flat Free", async () => {
    h.roles.isAdmin = true;
    h.entitlement.mockResolvedValue(FREE);
    const result = await settle();
    expect(result.current.canPlayRankedBot).toBe(true);
  });

  it("does not offer it to a NON-admin whose lookup throws", async () => {
    // The same rejection that must not cost admin its access must still cost
    // everyone else theirs: a thrown lookup is unknown, and unknown is closed.
    h.entitlement.mockRejectedValue(new Error("rpc down"));
    const result = await settle();
    expect(result.current.loading).toBe(false);
    expect(result.current.canPlayRankedBot).toBe(false);
  });

  it("still waits for the ROLE answer before offering anything", () => {
    // Admin ends the wait only once it is KNOWN. An unresolved role is not an
    // admin, so nothing is drawn optimistically and nothing flashes.
    h.roles.loading = true;
    h.roles.isAdmin = true;
    h.entitlement.mockResolvedValue(FREE);
    const { result } = renderHook(() => useRankedBotAccess());
    expect(result.current.loading).toBe(true);
    expect(result.current.canPlayRankedBot).toBe(false);
  });
});
