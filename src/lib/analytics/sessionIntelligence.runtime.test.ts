import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({
  e2e: false,
  firstTouchRecorded: false,
  rpc: vi.fn(),
  getSession: vi.fn(() => ({
    sessionId: "55555555-5555-4555-8555-555555555555",
    visitorId: "11111111-1111-4111-8111-111111111111",
    startedAt: 0,
    isNew: false,
    touch: {},
    traffic: { trafficClass: "unknown", trafficSource: null, classificationReason: null },
  })),
}));

vi.mock("@/lib/e2e/identity", () => ({ e2eEnabled: () => h.e2e }));
vi.mock("./identity", () => ({
  getSession: h.getSession,
  getVisitor: () => ({
    visitorId: "11111111-1111-4111-8111-111111111111",
    isNew: false,
    ephemeral: false,
  }),
  isFirstTouchRecorded: () => h.firstTouchRecorded,
}));
vi.mock("./schema", () => ({ analyticsDb: { rpc: h.rpc } }));
vi.mock("./runtime", () => ({
  readJson: () => null,
  writeJson: () => true,
  recordFailure: vi.fn(),
}));

import {
  installSessionIntelligence,
  observeAuthenticatedVisitor,
  recordExplicitSessionEnd,
  recordSessionActivitySnapshot,
  resetSessionIntelligenceForTests,
  retryPendingVisitorLink,
} from "./sessionIntelligence";

const user = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", is_anonymous: false } as User;

beforeEach(() => {
  resetSessionIntelligenceForTests();
  h.e2e = false;
  h.firstTouchRecorded = false;
  h.rpc.mockReset();
  h.getSession.mockClear();
});

describe("session intelligence runtime boundaries", () => {
  it("does not wire or call either Supabase RPC in E2E identity mode", async () => {
    h.e2e = true;
    installSessionIntelligence();
    await observeAuthenticatedVisitor(user);
    await recordExplicitSessionEnd();
    await recordSessionActivitySnapshot({
      sessionId: "55555555-5555-4555-8555-555555555555",
      visitorId: "11111111-1111-4111-8111-111111111111",
      activeMs: 1,
      lastActiveAt: null,
    });
    expect(h.getSession).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("treats an activity RPC false result as not persisted and retryable", async () => {
    h.rpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const input = {
      sessionId: "55555555-5555-4555-8555-555555555555",
      visitorId: "11111111-1111-4111-8111-111111111111",
      activeMs: 15_000,
      lastActiveAt: null,
    };
    expect(await recordSessionActivitySnapshot(input)).toBe(false);
    expect(await recordSessionActivitySnapshot(input)).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });

  it("does not advance the persistence watermark after RPC false", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    h.rpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    installSessionIntelligence();
    await vi.advanceTimersByTimeAsync(16_000);

    expect(h.rpc).toHaveBeenCalledTimes(2);
    resetSessionIntelligenceForTests();
    vi.useRealTimers();
  });

  it("installs throttled wheel and scroll activity listeners without changing traffic promotion", () => {
    const windowListener = vi.spyOn(window, "addEventListener");
    const documentListener = vi.spyOn(document, "addEventListener");
    installSessionIntelligence();
    expect(windowListener.mock.calls.some(([name]) => name === "wheel")).toBe(true);
    expect(documentListener.mock.calls.some(([name]) => name === "scroll")).toBe(true);
    resetSessionIntelligenceForTests();
    windowListener.mockRestore();
    documentListener.mockRestore();
  });

  it("retries identity linkage after first touch is persisted", async () => {
    h.rpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    await observeAuthenticatedVisitor(user);
    expect(h.rpc).toHaveBeenCalledTimes(1);

    h.firstTouchRecorded = true;
    expect(await retryPendingVisitorLink()).toBe(true);
    expect(h.rpc).toHaveBeenCalledTimes(2);

    expect(await retryPendingVisitorLink()).toBe(false);
    expect(h.rpc).toHaveBeenCalledTimes(2);
  });
});
