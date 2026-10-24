/**
 * PULSE-2A provider: who is read, how long for, what a failure shows, and
 * that one viewer's record never reaches another.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readHistoryPage, type HistoryPage } from "@/lib/history/contracts";
import type { TrendReport } from "@/lib/quiz/analyticsApi";
import golden from "@/pages/dev/lobby-preview/history/analyticsLab.golden.json";

import { publicPulseCatalogue } from "../pulse-provider";
import { LIVE_ITEM_IDS } from "./live-items";
import {
  GUEST_VIEWER,
  LIVE_READ_TIMEOUT_MS,
  clearPulseLiveCache,
  createLivePulseProvider,
  type PulseViewer,
} from "./live-provider";
import type { PulseLiveReads } from "./live-reads";

const pageFor = (name: "lab_free" | "lab_premium"): HistoryPage =>
  readHistoryPage(structuredClone((golden as unknown as { scenarios: Record<string, unknown[]> }).scenarios[name][0]));

const FREE_REPORT = {
  ok: true, tier: "free", windows: [], window_days: null, since: null, until: null,
  recent_answers: 12, span_days: 2, current: { attempts: 12, correct: 9, accuracy: 75, active_days: 2 },
  modes: [], categories: [], counts_modes: [], excludes_modes: [], sufficiency: { has_data: true },
} as unknown as TrendReport;

const ALICE: PulseViewer = { kind: "account", id: "user-alice", premium: "free" };
const BOB: PulseViewer = { kind: "account", id: "user-bob", premium: "free" };

function reads(over: Partial<PulseLiveReads> = {}): PulseLiveReads & { signals: AbortSignal[] } {
  const signals: AbortSignal[] = [];
  return {
    signals,
    history: vi.fn(async (s: AbortSignal) => { signals.push(s); return pageFor("lab_free"); }),
    practice: vi.fn(async (s: AbortSignal) => { signals.push(s); return FREE_REPORT; }),
    ...over,
  };
}
const ids = (cat: Record<string, readonly { id: string }[] | undefined>) => Object.values(cat).flatMap((items) => (items ?? []).map((i) => i.id));
const never = () => new Promise<never>(() => {});

beforeEach(() => clearPulseLiveCache());
afterEach(() => vi.useRealTimers());

describe("a guest", () => {
  it("is served the public editorial catalogue and Pulse reads nothing", async () => {
    const r = reads();
    const provider = createLivePulseProvider(GUEST_VIEWER, { reads: r });
    expect(provider.peek?.()).toEqual(publicPulseCatalogue());
    expect(await provider.load()).toEqual(publicPulseCatalogue());
    expect(r.history).not.toHaveBeenCalled();
    expect(r.practice).not.toHaveBeenCalled();
  });
});

describe("a signed-in account", () => {
  it("gets editorial plus its own record, and keeps the Premium promotion while Free", async () => {
    const cat = await createLivePulseProvider(ALICE, { reads: reads() }).load();
    expect(ids(cat)).toEqual(expect.arrayContaining([...ids(publicPulseCatalogue()), LIVE_ITEM_IDS.dailyRecord, LIVE_ITEM_IDS.practice]));
    expect(cat.premium?.length).toBeGreaterThan(0);
    expect(ids(cat)).not.toContain(LIVE_ITEM_IDS.dailyTrend);
  });

  it("is not shown the Premium promotion when the entitlement session or the server says Premium", async () => {
    const pro = await createLivePulseProvider({ ...ALICE, premium: "pro" }, { reads: reads() }).load();
    expect(pro.premium).toBeUndefined();
    clearPulseLiveCache();
    const serverPremium = await createLivePulseProvider(ALICE, { reads: reads({ history: async () => pageFor("lab_premium") }) }).load();
    expect(serverPremium.premium).toBeUndefined();
    expect(ids(serverPremium)).toContain(LIVE_ITEM_IDS.dailyTrend);
  });

  it("starts cold with an empty glass (no editorial to be swapped out), warm with its record", async () => {
    const r = reads();
    expect(createLivePulseProvider(ALICE, { reads: r }).peek?.()).toBeNull();
    await createLivePulseProvider(ALICE, { reads: r }).load();
    const again = createLivePulseProvider({ ...ALICE, premium: "pro" }, { reads: r });
    expect(ids(again.peek?.() ?? {})).toContain(LIVE_ITEM_IDS.dailyRecord);
    await again.load();
    expect(r.history).toHaveBeenCalledTimes(1);
  });

  it("never shows one viewer's warm record to another", async () => {
    await createLivePulseProvider(ALICE, { reads: reads() }).load();
    const bobReads = reads({ history: async () => ({ schemaVersion: 1, asOf: "", items: [], nextCursor: null }) });
    const bob = createLivePulseProvider(BOB, { reads: bobReads });
    expect(bob.peek?.()).toBeNull();
    const cat = await bob.load();
    expect(ids(cat)).not.toContain(LIVE_ITEM_IDS.dailyRecord);
    // and Alice's entry is gone, not merely shadowed
    expect(createLivePulseProvider(ALICE, { reads: reads() }).peek?.()).toBeNull();
  });
});

describe("failure is editorial, never empty", () => {
  it("both reads refused or broken: exactly what a guest sees", async () => {
    const r = reads({
      history: async () => { throw new Error("Quiz API 403: ACCOUNT_REQUIRED"); },
      practice: async () => { throw new Error("Pulse practice contract: unknown tier"); },
    });
    await expect(createLivePulseProvider(ALICE, { reads: r }).load()).resolves.toEqual(publicPulseCatalogue());
  });

  it("one read failing keeps the other's scene, and nothing partial is kept warm", async () => {
    const r = reads({ practice: async () => { throw new Error("Quiz API 503"); } });
    const cat = await createLivePulseProvider(ALICE, { reads: r }).load();
    expect(ids(cat)).toContain(LIVE_ITEM_IDS.dailyRecord);
    expect(ids(cat)).not.toContain(LIVE_ITEM_IDS.practice);
    expect(createLivePulseProvider(ALICE, { reads: r }).peek?.()).toBeNull();
  });

  it("is bounded: a read still running at the deadline is aborted and dropped", async () => {
    vi.useFakeTimers();
    const r = reads({ practice: (s) => { r.signals.push(s); return never(); } });
    const pending = createLivePulseProvider(ALICE, { reads: r }).load();
    await vi.advanceTimersByTimeAsync(LIVE_READ_TIMEOUT_MS);
    const cat = await pending;
    expect(ids(cat)).toContain(LIVE_ITEM_IDS.dailyRecord);
    expect(ids(cat)).not.toContain(LIVE_ITEM_IDS.practice);
    expect(r.signals.every((s) => s.aborted)).toBe(true);
  });
});

describe("cancellation", () => {
  it("the caller's abort aborts every read, rejects as an abort and keeps nothing warm", async () => {
    const r = reads({ history: (s) => { r.signals.push(s); return never(); }, practice: (s) => { r.signals.push(s); return never(); } });
    const ctl = new AbortController();
    const pending = createLivePulseProvider(ALICE, { reads: r }).load(ctl.signal);
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(r.signals).toHaveLength(2);
    expect(r.signals.every((s) => s.aborted)).toBe(true);
    expect(createLivePulseProvider(ALICE, { reads: reads() }).peek?.()).toBeNull();
  });
});
