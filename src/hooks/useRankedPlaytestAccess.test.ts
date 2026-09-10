/**
 * RB3 — who is offered the guided playtest.
 *
 * The distinction the phase turns on, and the one an ordinary Premium
 * subscriber must never fall through: "may I use Bot Ranked" is not "am I in
 * the playtest". Every case here pairs the two hooks so a change that blurred
 * them fails immediately.
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
import { useRankedPlaytestAccess } from "./useRankedPlaytestAccess";

const FREE = { effectivePro: false, grantKind: null };
const PREMIUM = { effectivePro: true, grantKind: null };
const PLAYTESTER = { effectivePro: true, grantKind: "playtest" };
const COMPED = { effectivePro: true, grantKind: "manual" };

beforeEach(() => {
  h.roles.isAdmin = false;
  h.roles.loading = false;
  h.entitlement.mockResolvedValue(FREE);
});
afterEach(() => vi.clearAllMocks());

async function both() {
  const playtest = renderHook(() => useRankedPlaytestAccess());
  const bot = renderHook(() => useRankedBotAccess());
  await waitFor(() => expect(playtest.result.current.loading).toBe(false));
  await waitFor(() => expect(bot.result.current.loading).toBe(false));
  return {
    playtest: playtest.result.current.canPlayGuidedPlaytest,
    bot: bot.result.current.canPlayRankedBot,
  };
}

describe("bot access and playtest participation are different questions", () => {
  it("a playtest grant answers YES to both", async () => {
    h.entitlement.mockResolvedValue(PLAYTESTER);
    expect(await both()).toEqual({ playtest: true, bot: true });
  });

  it("an ordinary Premium subscriber gets Bot Ranked and NOT the playtest", async () => {
    h.entitlement.mockResolvedValue(PREMIUM);
    expect(await both()).toEqual({ playtest: false, bot: true });
  });

  it("a comped (manual-grant) account is Premium, not a playtester", async () => {
    h.entitlement.mockResolvedValue(COMPED);
    expect(await both()).toEqual({ playtest: false, bot: true });
  });

  it("a Free account gets neither", async () => {
    expect(await both()).toEqual({ playtest: false, bot: false });
  });

  it("an admin gets both, as the operator override", async () => {
    h.roles.isAdmin = true;
    expect(await both()).toEqual({ playtest: true, bot: true });
  });
});

describe("it fails closed", () => {
  it("says no while the answer is arriving", () => {
    h.entitlement.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRankedPlaytestAccess());
    expect(result.current.loading).toBe(true);
    expect(result.current.canPlayGuidedPlaytest).toBe(false);
  });

  it("treats an UNRESOLVED entitlement as not a playtester", async () => {
    h.entitlement.mockResolvedValue(null);
    const { result } = renderHook(() => useRankedPlaytestAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canPlayGuidedPlaytest).toBe(false);
  });

  it("refuses a playtest grant that is no longer in effect", async () => {
    // PT1.4's composition nulls a lapsed grant's kind, but a payload that
    // somehow carried both must still be judged on `effectivePro`.
    h.entitlement.mockResolvedValue({ effectivePro: false, grantKind: "playtest" });
    const { result } = renderHook(() => useRankedPlaytestAccess());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canPlayGuidedPlaytest).toBe(false);
  });
});
