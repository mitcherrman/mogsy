/**
 * PT5.3A — the owner lab's BLIND AUTOMATIC flow, integrated in jsdom: the REAL
 * api client over stand-ins that answer from the REAL backend captures, the
 * REAL engine, count-in, arena, reveal and transition. Time is hand-cranked:
 * animation frames and `performance.now()` by `installFakeFrames`, timeouts by
 * fake timers. Each stop is stamped at exactly the captured interval FROM THE
 * GAME'S START (the clock read when the count-in executed it), so the stand-in
 * answers with the captured release.
 *
 * Proves: the game starts every round (3, 2, 1 → running) and no press can;
 * the player's one stop locks the exact interval; nothing on the stage is a
 * number while it runs; reveals and slice transitions move on by themselves;
 * Hold (count-in, reveal, transition) stops that and a held count-in resumes
 * from 3; a hidden tab re-counts a count-in and voids a running round, which
 * then waits for the player; a slow or failed lock never auto-advances; the
 * public host and `?flow=visible` keep the PT5.2 flow.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import capture from "@/lib/perfect-timing/__fixtures__/captureV1.json";
import sliceCapture from "@/lib/perfect-timing/__fixtures__/sliceCaptureV1.json";
import { perfectTimingApi } from "@/lib/perfect-timing/api";
import { installFakeFrames, type FakeFrames } from "@/lib/perfect-timing/fakeFrames.testutil";
import { REVEAL_BEATS } from "@/components/perfect-timing/PerfectTimingReveal";
import { LOCK_HOLD_MS, REVEAL_DWELL_MS, TRANSITION_DWELL_MS, TRANSITION_READY_MS } from "@/components/perfect-timing/presentation";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

const play = vi.fn();
vi.mock("@/lib/audio/useSfx", () => ({
  useSfx: () => ({ play, stop: () => {}, preload: () => {} }),
}));

vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return { ...real, championAssetsQuery: { ...real.championAssetsQuery, queryFn: async () => ({ champions: {} }) } };
});

import PerfectTimingPage from "./PerfectTimingPage";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const BASE = "http://backend.test/api/admin/perfect-timing";
const LOCKS = capture.locks as Json[];
const SLICE_LOCKS = sliceCapture.locks as Json[];
const future = () => new Date(Date.now() + 15 * 60_000).toISOString();

interface Reply { status: number; body: unknown }
type Override = (path: string, body: Json) => Reply | Promise<Reply> | undefined;

/** One stand-in for both routes, answering from the captures. */
function standIn(override?: Override) {
  const calls: { path: string; body: Json }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(BASE, "");
    const body = JSON.parse(String(init?.body ?? "{}")) as Json;
    calls.push({ path, body });
    const reply = (await override?.(path, body)) ?? (() => {
      if (path === "/deal") {
        const deal = clone(capture.deal.response) as Json;
        for (const r of deal.rounds) r.expires_at = future();
        return { status: 200, body: deal };
      }
      if (path === "/slices/deal") {
        const d = clone(sliceCapture.deal.response) as Json;
        d.expires_at = future();
        return { status: 200, body: d };
      }
      let m = path.match(/^\/rounds\/([^/]+)\/lock$/);
      const lock = m && LOCKS.find((l) => l.round_id === m![1]);
      if (lock && body.elapsed_ms === lock.request.elapsed_ms) return { status: 200, body: lock.response };
      m = path.match(/^\/slices\/([^/]+)\/rounds\/([^/]+)\/lock$/);
      const i = m ? (sliceCapture.deal.response.stages as Json[]).findIndex((s) => s.round_id === m![2]) : -1;
      if (m && i >= 0 && body.elapsed_ms === SLICE_LOCKS[i].request.elapsed_ms) {
        return { status: 200, body: { ...clone(SLICE_LOCKS[i].response), slice_expires_at: future() } };
      }
      return { status: 404, body: { detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "Unknown or expired round." } } } };
    })();
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  });
  const locks = () => calls.filter((c) => c.path.endsWith("/lock"));
  return { fetchImpl, calls, locks };
}

function mount(be: ReturnType<typeof standIn>, opts: { mode?: "random" | "slice"; url?: string } = {}) {
  const api = perfectTimingApi({ fetchImpl: be.fetchImpl as unknown as typeof fetch, sleep: async () => {} });
  return render(<MemoryRouter initialEntries={[opts.url ?? "/"]}><PerfectTimingPage api={api} initialMode={opts.mode ?? "random"} /></MemoryRouter>);
}

let ff: FakeFrames;
const seal = () => screen.getByTestId("pt-press-surface");
const phase = () => screen.queryByTestId("pt-press-surface")?.getAttribute("data-phase") ?? null;
const pageStage = () => screen.getByTestId("perfect-timing-page").getAttribute("data-stage");

/** Let promises settle and move both clocks `ms` forward. */
async function flush(ms = 0) {
  await act(async () => {
    if (ms) ff.setNow(ff.now + ms);
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function key(target: Element | Document, t: number, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, "timeStamp", { value: t });
  fireEvent(target, e);
}

/** Paint the count-in through: 3 → 2 → 1 → the game's start. Returns the start the engine recorded. */
function countIn(): number {
  expect(phase()).toBe("countdown");
  expect(screen.getByTestId("pt-chrono-count")).toHaveTextContent("3");
  ff.frame(ff.now + 1_000);
  expect(screen.getByTestId("pt-chrono-count")).toHaveTextContent("2");
  ff.frame(ff.now + 1_000);
  expect(screen.getByTestId("pt-chrono-count")).toHaveTextContent("1");
  ff.frame(ff.now + 1_000);
  expect(phase()).toBe("running");
  return ff.now;
}

/** From the stop, through the lock and its hold, to the reveal on screen. */
async function toReveal() {
  await flush();
  await flush(LOCK_HOLD_MS + 10);
  expect(screen.getByTestId("pt-reveal")).toBeInTheDocument();
}

/** The reveal settles and its dwell runs out. */
async function revealMovesOn() {
  await flush(REVEAL_BEATS.focus);
  await flush(REVEAL_DWELL_MS);
}

/** Digits on the stage other than the rank plate's. */
function stageDigits(): string[] {
  const stage = screen.getByTestId("pt-stage").cloneNode(true) as HTMLElement;
  stage.querySelector('[data-testid="pt-rank"]')?.remove();
  return stage.textContent?.match(/\d/g) ?? [];
}

const sfxNames = () => play.mock.calls.map((c) => String(c[0]));
const setVisibility = (v: DocumentVisibilityState) => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });

beforeEach(() => {
  play.mockClear();
  setVisibility("visible");
  ff = installFakeFrames(100_000);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  ff.restore();
  setVisibility("visible");
  vi.clearAllMocks();
});

describe("PT5.3A Random Run — blind automatic flow", () => {
  it("plays all five rounds by STOPS ONLY: the game starts each one, the reveal moves on by itself, results at the end", async () => {
    const be = standIn();
    mount(be);
    await flush();
    for (let i = 0; i < LOCKS.length; i++) {
      const t0 = countIn();
      expect(stageDigits(), "no number on the stage while it runs").toEqual([]);
      expect(screen.queryByTestId("pt-chrono-digits")).toBeNull();
      expect(document.body.textContent).not.toContain(LOCKS[i].response.authority.cooldown_raw as string);
      key(seal(), t0 + (LOCKS[i].request.elapsed_ms as number));
      expect(screen.getByTestId("pt-chrono-digits")).toHaveTextContent(((LOCKS[i].request.elapsed_ms as number) / 1000).toFixed(2));
      await toReveal();
      await revealMovesOn();
    }
    expect(screen.getByTestId("pt-results")).toBeInTheDocument();
    expect(be.locks().map((c) => [c.path, c.body])).toEqual(LOCKS.map((l) => [`/rounds/${l.round_id}/lock`, { elapsed_ms: l.request.elapsed_ms }]));
    // Per round: three count-in voices, the cast, the lock, the verdict. No tick, no old start cue.
    const names = sfxNames();
    expect(names.filter((n) => n === "perfect-timing.countin")).toHaveLength(10);
    expect(names.filter((n) => n === "perfect-timing.countin.final")).toHaveLength(5);
    expect(names.filter((n) => n === "perfect-timing.cast")).toHaveLength(5);
    expect(names.filter((n) => n === "perfect-timing.lock")).toHaveLength(5);
    expect(names.some((n) => n.startsWith("perfect-timing.clock.") || n === "ranked.module.start")).toBe(false);
    // The results do not start a new run by themselves.
    await flush(30_000);
    expect(screen.getByTestId("pt-results")).toBeInTheDocument();
  });

  it("no press can start a round: pointer, seal key and document key during the count-in are refused, and the real stop is exact", async () => {
    const be = standIn();
    mount(be);
    await flush();
    const start = ff.now;
    key(seal(), start + 500);
    fireEvent.pointerDown(seal(), { button: 0, isPrimary: true });
    ff.frame(start + 1_000);
    key(document, start + 1_500);
    key(document, start + 2_990, { key: "Enter" });
    expect(phase()).toBe("countdown");
    expect(be.locks()).toHaveLength(0);
    ff.frame(start + 2_000);
    ff.frame(start + 3_004);
    expect(phase()).toBe("running");
    // A press that bled over from the last beat (inside MIN_RUN_MS) does not stop it.
    key(seal(), start + 3_004 + 120);
    expect(phase()).toBe("running");
    key(seal(), start + 3_004 + (LOCKS[0].request.elapsed_ms as number));
    await flush();
    expect(be.locks()).toHaveLength(1);
    expect(be.locks()[0].body).toEqual({ elapsed_ms: LOCKS[0].request.elapsed_ms });
  });

  it("Hold on the reveal stops the automatic advance; Next continues into the next count-in", async () => {
    const be = standIn();
    mount(be);
    await flush();
    key(seal(), countIn() + (LOCKS[0].request.elapsed_ms as number));
    await toReveal();
    await flush(REVEAL_BEATS.focus + 1_000);
    fireEvent.click(screen.getByTestId("pt-hold"));
    await flush(60_000);
    expect(screen.getByTestId("pt-reveal")).toBeInTheDocument();
    expect(screen.getByTestId("pt-hold")).toBeDisabled();
    fireEvent.click(screen.getByTestId("pt-next"), { detail: 1 });
    await flush();
    expect(phase()).toBe("countdown");
    expect(screen.getByTestId("pt-chrono-count")).toHaveTextContent("3");
    expect(be.locks()).toHaveLength(1);
  });

  it("Hold during the count-in cancels it (nothing starts however long it waits); Resume counts in again from 3", async () => {
    mount(standIn());
    await flush();
    ff.frame(ff.now + 1_500);
    fireEvent.click(screen.getByTestId("pt-hold"));
    expect(screen.getByTestId("pt-chrono-held")).toBeInTheDocument();
    expect(ff.pending()).toBe(0);
    ff.frame(ff.now + 60_000);
    await flush(60_000);
    expect(phase()).toBe("countdown");
    fireEvent.click(screen.getByTestId("pt-resume"));
    expect(screen.getByTestId("pt-chrono-count")).toHaveTextContent("3");
    expect(seal()).toHaveFocus();
    const resumedAt = ff.now;
    ff.frame(resumedAt + 2_999);
    expect(phase()).toBe("countdown");
    ff.frame(resumedAt + 3_000);
    expect(phase()).toBe("running");
  });

  it("a tab hidden during the count-in never starts the round; back, it counts in from 3", async () => {
    mount(standIn());
    await flush();
    ff.frame(ff.now + 2_500);
    setVisibility("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    ff.frame(ff.now + 10_000);
    expect(phase()).toBe("countdown");
    expect(screen.queryByTestId("pt-chrono-count")).toBeNull();
    setVisibility("visible");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.getByTestId("pt-chrono-count")).toHaveTextContent("3");
    countIn();
  });

  it("a tab hidden while it runs voids the round, which then WAITS for the player (no automatic advance)", async () => {
    const be = standIn();
    mount(be);
    await flush();
    countIn();
    setVisibility("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    setVisibility("visible");
    await flush();
    expect(pageStage()).toBe("voided");
    await flush(60_000);
    expect(pageStage()).toBe("voided");
    expect(be.locks()).toHaveLength(0);
    fireEvent.click(screen.getByTestId("pt-continue"));
    await flush();
    expect(phase()).toBe("countdown");
  });

  it("a slow lock keeps the stop locked and never advances; the reveal comes when the server answers", async () => {
    let release: (r: Reply) => void = () => {};
    const be = standIn((path) => (path.endsWith("/lock") ? new Promise<Reply>((r) => { release = r; }) : undefined));
    mount(be);
    await flush();
    key(seal(), countIn() + (LOCKS[0].request.elapsed_ms as number));
    await flush(20_000);
    expect(screen.queryByTestId("pt-reveal")).toBeNull();
    expect(phase()).toMatch(/stopped|submitting/);
    expect(screen.getByTestId("pt-status")).toHaveTextContent(/Locked at/);
    release({ status: 200, body: LOCKS[0].response });
    await toReveal();
    await revealMovesOn();
    expect(phase()).toBe("countdown");
  });

  it("a failed lock waits for the player's recovery choice", async () => {
    const be = standIn((path) => (path.endsWith("/lock") ? { status: 409, body: { detail: { error: { code: "PT_ALREADY_LOCKED", message: "already locked" } } } } : undefined));
    mount(be);
    await flush();
    key(seal(), countIn() + 4_000);
    await flush();
    await flush(60_000);
    expect(screen.getByTestId("pt-void-continue")).toBeInTheDocument();
    expect(pageStage()).toBe("lock-error");
  });

  it("the public host keeps the PT5.2 flow (press to cast, visible stopwatch); ?flow=visible does in the lab", async () => {
    const api = perfectTimingApi({ fetchImpl: standIn().fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    const host = { dealErrorText: () => "", exitLabel: "Back", onExit: () => {} };
    const { unmount } = render(<MemoryRouter><PerfectTimingPage api={api} publicHost={host} /></MemoryRouter>);
    await flush();
    expect(phase()).toBe("armed");
    expect(screen.getByTestId("pt-chrono-digits")).toHaveTextContent("0.00");
    expect(screen.getByTestId("pt-chrono")).not.toHaveAttribute("data-flow");
    unmount();
    mount(standIn(), { url: "/?flow=visible" });
    await flush();
    expect(phase()).toBe("armed");
  });
});

describe("PT5.3A Mastery Slice — blind automatic flow", () => {
  /** Through a transition that continues by itself. */
  async function transitionMovesOn(kind: string) {
    expect(screen.getByTestId("pt-transition")).toHaveAttribute("data-kind", kind);
    expect(screen.queryByTestId("pt-press-surface")).toBeNull();
    await flush(TRANSITION_READY_MS);
    await flush(TRANSITION_DWELL_MS);
  }

  it("three stages by stops only: count-in, stop, reveal → Rank up → count-in … → results, every move automatic", async () => {
    const be = standIn();
    mount(be, { mode: "slice" });
    await flush();
    const stages = sliceCapture.deal.response.stages as Json[];
    for (let i = 0; i < 3; i++) {
      const t0 = countIn();
      expect(stageDigits(), "no number but the hero plate's rank and haste").toEqual([]);
      key(seal(), t0 + (SLICE_LOCKS[i].request.elapsed_ms as number));
      await toReveal();
      await revealMovesOn();
      if (i === 0) await transitionMovesOn("rank_up");
      if (i === 1) await transitionMovesOn("equipped");
    }
    expect(screen.getByTestId("pt-results")).toHaveAttribute("data-mode", "slice");
    expect(be.locks().map((c) => c.path)).toEqual(stages.map((s) => `/slices/${sliceCapture.deal.response.slice_id}/rounds/${s.round_id}/lock`));
    expect(be.locks().map((c) => c.body.elapsed_ms)).toEqual(SLICE_LOCKS.map((l) => l.request.elapsed_ms));
  });

  it("Hold on a transition stops it; Continue then arms the stage's count-in", async () => {
    mount(standIn(), { mode: "slice" });
    await flush();
    key(seal(), countIn() + (SLICE_LOCKS[0].request.elapsed_ms as number));
    await toReveal();
    await revealMovesOn();
    expect(screen.getByTestId("pt-transition")).toBeInTheDocument();
    await flush(TRANSITION_READY_MS);
    fireEvent.click(screen.getByTestId("pt-hold"));
    await flush(60_000);
    expect(screen.getByTestId("pt-transition")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pt-tr-continue"), { detail: 1 });
    await flush();
    expect(phase()).toBe("countdown");
    expect(screen.getByTestId("pt-stage-badge")).toHaveTextContent(/rank up/i);
  });
});
