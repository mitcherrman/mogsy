/**
 * UX-3 — the server-driven BO5 through the real screens (jsdom, motion off).
 * The transport is the contract double over an in-memory store; the test
 * answers Baron questions with the double's private key (tests only).
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ allowed: false }));
vi.mock("@/lib/motion/useReveal", async (orig) => ({ ...(await orig<typeof import("@/lib/motion/useReveal")>()), useMotionAllowed: () => motion.allowed }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: () => undefined, stop: () => undefined, preload: () => undefined }) }));
vi.mock("@/lib/admin-auth/adminCredentials", () => ({ ADMIN_API_BASE_URL: "http://backend.test", buildAdminHeaders: async () => ({ Authorization: "Bearer owner-session" }) }));

import { FixtureSeriesServer, __placeholderAnswerForTests, memoryStore, type KeyValueStore } from "@/lib/dynasty/e1/fixtureServer";
import capture from "@/lib/dynasty/e1/fixtures/e2-live-capture.json";
import { LiveSeriesTransport } from "@/lib/dynasty/e1/liveTransport";
import type { SeriesEnvelope } from "@/lib/dynasty/e1/contracts";
import type { DynastySeriesTransport } from "@/lib/dynasty/e1/transport";
import { useDynastySeries } from "@/lib/dynasty/e1/useDynastySeries";
import { StingerHost, ambience, ambientResetForTests } from "../broadcast";
import { Bo5Flow } from "./Bo5Flow";

beforeEach(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; ambientResetForTests(); ambience.resetForTests(); try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => cleanup());

const tid = (id: string) => screen.getByTestId(id);
const has = (id: string) => screen.queryByTestId(id) !== null;
const screenId = () => tid("dynasty-bo5").getAttribute("data-screen");
async function click(id: string) { await act(async () => { fireEvent.click(tid(id)); }); }
async function settle() { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); }

function mount(t: DynastySeriesTransport) {
  return render(<MemoryRouter><StingerHost><Bo5Flow transport={t} /></StingerHost></MemoryRouter>);
}

async function startSeries(plan = "balanced") {
  await waitFor(() => expect(screenId()).toBe("home"));
  await click("bo5-new");
  await click("org-choose-ember");
  await waitFor(() => expect(screenId()).toBe("roster"));
  await click("roster-confirm");
  await click(`plan-${plan}`);
  await click("prep-confirm");
  await waitFor(() => expect(screenId()).toBe("draft"));
}

async function answerBaron(correct: number) {
  await click("objective-start");
  for (let i = 0; i < 3; i++) {
    await waitFor(() => expect(tid(`q-pip-${i}`).getAttribute("data-state")).toBe("answering"));
    const prompt = tid("objective-question").textContent!;
    const key = __placeholderAnswerForTests(prompt);
    const n = screen.getAllByTestId(/^objective-opt-/).length;
    await click(`objective-opt-${i < correct ? key : (key + 1) % n}`);
    await waitFor(() => expect(has("objective-next")).toBe(true));
    await click("objective-next");
  }
  await waitFor(() => expect(tid("objective-graded").getAttribute("data-correct")).toBe(String(correct)));
  await click("objective-settle");
  await waitFor(() => expect(has("objective-outcome")).toBe(true));
  expect(tid("objective-outcome").getAttribute("data-correct")).toBe(String(correct));
  await click("objective-continue");
}

/** Draft `lineup`, play the game through the server beats, leave the game view. Returns the beats seen. */
async function playGame(lineup: string, baron = 3) {
  await click(`draft-${lineup}`);
  await click("draft-lock");
  await waitFor(() => expect(screenId()).toBe("game"));
  if (has("lock-skip")) await click("lock-skip");
  const beats: string[] = [];
  for (let guard = 0; guard < 60; guard++) {
    const v = tid("game-view");
    beats.push(`${v.getAttribute("data-seq")}:${v.getAttribute("data-beat")}`);
    if (has("objective-panel") && tid("objective-panel").getAttribute("data-phase") === "stakes") { await answerBaron(baron); continue; }
    const label = tid("game-continue").textContent;
    await click("game-continue");
    if (label === "See the game result") break;
  }
  await waitFor(() => expect(screenId()).toBe("result"));
  return beats;
}

describe("UX-3 BO5 flow", () => {
  it("plays a complete BO5 to first-to-three from server state, with real consequences on screen", async () => {
    const srv = new FixtureSeriesServer({ store: memoryStore() });
    mount(srv);
    await waitFor(() => expect(screenId()).toBe("home"));
    await startSeries("balanced");
    const plan = ["balanced", "early", "early", "balanced", "balanced"];
    for (let g = 0; g < 5; g++) {
      const beats = await playGame(plan[g]);
      expect(beats.length).toBeGreaterThan(3);
      // Result screen reflects the server tally.
      const bar = tid("run-bar-series").textContent;
      await click("result-next");
      if (screenId() === "series") break;
      expect(screenId()).toBe("decision");
      expect(bar).toMatch(/Series \d–\d/);
      const keep = plan[g + 1] === plan[g];
      await click(keep ? "decision-keep_plan" : "decision-switch_plan");
      if (!keep) await click(`switch-${plan[g + 1]}`);
      await click("decision-confirm");
      await waitFor(() => expect(screenId()).toBe("draft"));
    }
    expect(screenId()).toBe("series");
    expect(document.getElementById("bo5-series-h")!.textContent).toBe("Series won 3–2");
    expect(screen.getAllByTestId(/^series-game-/).map((x) => x.getAttribute("data-winner"))).toEqual(["you", "opponent", "opponent", "you", "you"]);
    expect(tid("series-game-5").textContent).toMatch(/Baron 3\/3/);
    expect(tid("pending-consequences").textContent).toMatch(/E3 pending/);
    expect(srv.gradedAnswers).toBe(6);
  }, 60_000);

  it("recovery decisions that need E3 are visible but not selectable", async () => {
    mount(new FixtureSeriesServer({ store: memoryStore() }));
    await startSeries("early");
    await playGame("early");
    await click("result-next");
    expect((tid("decision-recovery_rest") as HTMLButtonElement).disabled).toBe(true);
    expect(tid("decision-recovery_rest").textContent).toMatch(/E3 pending/);
  }, 30_000);

  it("drops duplicate clicks while a request is in flight", async () => {
    const srv = new FixtureSeriesServer({ store: memoryStore(), delayMs: 30 });
    mount(srv);
    await waitFor(() => expect(screenId()).toBe("home"));
    await startSeries("early");
    await click("draft-early");
    await act(async () => { fireEvent.click(tid("draft-lock")); fireEvent.click(tid("draft-lock")); fireEvent.click(tid("draft-lock")); });
    await waitFor(() => expect(screenId()).toBe("game"), { timeout: 2000 });
    if (has("lock-skip")) await click("lock-skip");
    const rev = Number(tid("dynasty-bo5").getAttribute("data-rev"));
    await act(async () => { fireEvent.click(tid("game-continue")); fireEvent.click(tid("game-continue")); fireEvent.click(tid("game-skip")); });
    await waitFor(() => expect(has("game-busy")).toBe(false), { timeout: 2000 });
    // Exactly one transition (Continue stops on the first pause beat: stage_open).
    expect(tid("game-view").getAttribute("data-seq")).toBe("1");
    expect(Number(tid("dynasty-bo5").getAttribute("data-rev"))).toBe(rev + 1);
    expect(has("series-error")).toBe(false);
  }, 30_000);

  it("survives a lost response: Retry resends the same request and nothing is applied twice", async () => {
    const srv = new FixtureSeriesServer({ store: memoryStore() });
    mount(srv);
    await startSeries("early");
    await playGame("early").catch(() => undefined); // finish game 1 cleanly first
    await click("result-next");
    await click("decision-keep_plan");
    await click("decision-confirm");
    await click("draft-early");
    await click("draft-lock");
    if (has("lock-skip")) await click("lock-skip");
    srv.inject({ method: "advance", when: "after" });
    await click("game-continue");
    await waitFor(() => expect(tid("series-error").getAttribute("data-code")).toBe("NETWORK"));
    expect(tid("game-view").getAttribute("data-seq")).toBe("0"); // UI never guesses
    await click("series-retry");
    await waitFor(() => expect(has("series-error")).toBe(false));
    expect(tid("game-view").getAttribute("data-seq")).toBe("1"); // applied once, not twice
  }, 30_000);

  it("resumes mid-encounter after a refresh, with locked answers kept", async () => {
    const store: KeyValueStore = memoryStore();
    let srv = new FixtureSeriesServer({ store });
    const { unmount } = mount(srv);
    await startSeries("balanced");
    for (const [l, next] of [["balanced", "early"], ["early", "early"], ["early", "balanced"]] as const) {
      await playGame(l);
      await click("result-next");
      await click(l === next ? "decision-keep_plan" : "decision-switch_plan");
      if (l !== next) await click(`switch-${next}`);
      await click("decision-confirm");
    }
    await click("draft-balanced");
    await click("draft-lock");
    if (has("lock-skip")) await click("lock-skip");
    for (let i = 0; i < 40 && !has("objective-panel"); i++) await click("game-continue");
    await click("objective-start");
    const key = __placeholderAnswerForTests(tid("objective-question").textContent!);
    await click(`objective-opt-${key}`);
    await waitFor(() => expect(tid("q-pip-0").getAttribute("data-state")).toBe("revealed_correct"));
    const graded = srv.gradedAnswers;
    unmount();
    srv = new FixtureSeriesServer({ store }); // refresh
    mount(srv);
    await waitFor(() => expect(screenId()).toBe("game"));
    expect(tid("objective-panel").getAttribute("data-phase")).toBe("ask");
    expect(tid("q-pip-0").getAttribute("data-state")).toBe("revealed_correct");
    expect(tid("q-pip-1").getAttribute("data-state")).toBe("answering");
    expect(srv.gradedAnswers + graded).toBe(1);
  }, 60_000);

  it("shows a loading state, then a retryable error when the server is unreachable", async () => {
    const srv = new FixtureSeriesServer({ store: memoryStore() });
    srv.inject({ method: "resume", when: "before", code: "NETWORK" });
    mount(srv);
    await waitFor(() => expect(tid("series-error").getAttribute("data-code")).toBe("NETWORK"));
    await click("series-retry");
    await waitFor(() => expect(has("series-error")).toBe(false));
    expect(screenId()).toBe("home");
  });
});

describe("useDynastySeries", () => {
  it("rejects a stale response: an older envelope never replaces a newer one", async () => {
    const srv = new FixtureSeriesServer({ store: memoryStore() });
    const first = await srv.create({ requestId: "x1" });
    let old: SeriesEnvelope | null = first;
    const t: DynastySeriesTransport = Object.assign(Object.create(Object.getPrototypeOf(srv)), srv, {
      resume: async () => old,
    });
    const { result } = renderHook(() => useDynastySeries(t));
    await waitFor(() => expect(result.current.env?.series.rev).toBe(first.series.rev));
    await act(async () => { await result.current.choosePlan("early"); });
    const rev = result.current.env!.series.rev;
    expect(rev).toBe(first.series.rev + 1);
    old = first; // a late, older read arrives
    await act(async () => { await result.current.reload(); });
    expect(result.current.env!.series.rev).toBe(rev);
  });
});

describe("UX-5 live discovery (captured rev-2 responses)", () => {
  const S = Object.fromEntries((capture as unknown as { samples: { state: string; response: unknown }[] }).samples.map((x) => [x.state, x.response])) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const BASE = "http://backend.test/api/admin/dynasty/v2";
  function backend(answer: (method: string, url: string, body: any) => { status?: number; body: unknown }) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const calls: { method: string; url: string; body: any }[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    const f = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const c = { method: init?.method ?? "GET", url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null };
      calls.push(c);
      const r = answer(c.method, c.url, c.body);
      return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
    });
    return { f: f as unknown as typeof fetch, calls };
  }

  it("lets the owner pick among several unfinished series and resumes only the picked one", async () => {
    const multi = S.discovery_multiple;
    const picked = multi.series[1].series_id;
    const { f, calls } = backend((_m, url) => ({ body: url.endsWith("/series") ? multi : { ...S.series_created, series_id: picked } }));
    mount(new LiveSeriesTransport({ store: memoryStore(), fetchImpl: f }));
    await waitFor(() => expect(screenId()).toBe("pick"));
    expect(screen.getAllByTestId("series-choice").map((b) => b.getAttribute("data-series"))).toEqual(multi.series.map((x: { series_id: string }) => x.series_id));
    expect(calls).toHaveLength(1); // nothing is resumed silently
    await act(async () => { fireEvent.click(screen.getAllByTestId("series-choice")[1]); });
    await waitFor(() => expect(screenId()).toBe("roster"));
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET ${BASE}/series`, `GET ${BASE}/series/${picked}`]);
  });

  it("turns a refused automatic create into the picker, and Start a new series creates explicitly", async () => {
    const { f, calls } = backend((m, url, body) => {
      if (m === "GET") return { body: S.discovery_none };
      return body.when_unfinished_exists === "refuse" ? { status: 409, body: S.create_refused } : { body: S.series_created };
    });
    mount(new LiveSeriesTransport({ store: memoryStore(), fetchImpl: f }));
    await waitFor(() => expect(screenId()).toBe("home"));
    await click("bo5-new");
    await click("org-choose-ember");
    await waitFor(() => expect(screenId()).toBe("pick"));
    expect(has("series-error")).toBe(false);
    expect(screen.getAllByTestId("series-choice")).toHaveLength(S.create_refused.detail.unfinished.count);
    await click("pick-new");
    await waitFor(() => expect(screenId()).toBe("org"));
    await click("org-choose-ember");
    await waitFor(() => expect(screenId()).toBe("roster"));
    expect(calls.filter((c) => c.method === "POST").map((c) => c.body.when_unfinished_exists)).toEqual(["refuse", "create"]);
  });
});
