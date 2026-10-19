/**
 * PT4 — the whole owner run in jsdom: the REAL api client (`perfectTimingApi`)
 * over a stand-in `fetch` that answers from the REAL backend capture
 * (`captureV1.json`, backend PT3 1b81c460), the REAL PT2 engine and the REAL
 * PT1 arena. Only the audio hook is stubbed, to count cues.
 *
 * Timing is driven with stamped keyboard events (jsdom's `Event.timeStamp` is
 * read-only, so it is defined per event, as PT2's own tests do); each stop is
 * stamped at exactly the captured `elapsed_ms`, so the stand-in can answer
 * with the captured release verbatim.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import capture from "@/lib/perfect-timing/__fixtures__/captureV1.json";
import { perfectTimingApi } from "@/lib/perfect-timing/api";
import { formatLocked } from "@/lib/perfect-timing/chronometer";
import { MIN_RUN_MS } from "@/lib/perfect-timing/timingEngine";

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
  const manifest = {
    champions: {
      Ahri: { icon: "assets/champions/Ahri/icon.png", splash: "assets/champions/Ahri/splash/0_default.jpg", loading: "", cutout: "" },
    },
  };
  return { ...real, championAssetsQuery: { ...real.championAssetsQuery, queryFn: async () => manifest } };
});

import PerfectTimingPage from "./PerfectTimingPage";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const BASE = "http://backend.test/api/admin/perfect-timing";
const LOCKS: Json[] = capture.locks as Json[];
const ELAPSED: Record<string, number> = Object.fromEntries(LOCKS.map((l) => [l.round_id, l.request.elapsed_ms]));
const future = () => new Date(Date.now() + 15 * 60_000).toISOString();

interface Reply { status: number; body: unknown }
type Override = (path: string, body: Json, n: number) => Reply | "network" | undefined;

/** Stand-in for PT3's router, answering from the capture. */
function standIn(override?: Override) {
  const calls: { path: string; body: Json }[] = [];
  let extra = 0;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(BASE, "");
    const body = JSON.parse(String(init?.body ?? "{}")) as Json;
    calls.push({ path, body });
    const n = calls.filter((c) => c.path === path).length;
    const o = override?.(path, body, n);
    if (o === "network") throw new TypeError("Failed to fetch");
    const reply = o ?? (() => {
      if (path === "/deal") {
        const deal = clone(capture.deal.response) as Json;
        for (const r of deal.rounds) r.expires_at = future();
        if (body.count === 1) {
          // A fresh single deal: a new opaque id over a captured round.
          const fresh = { ...deal.rounds[3], round_id: `pt_${String(++extra).padStart(32, "f")}` };
          return { status: 200, body: { ...deal, rounds: [fresh] } };
        }
        return { status: 200, body: deal };
      }
      const m = path.match(/^\/rounds\/([^/]+)\/lock$/);
      const lock = m && LOCKS.find((l) => l.round_id === m[1]);
      if (lock && body.elapsed_ms === lock.request.elapsed_ms) return { status: 200, body: lock.response };
      return { status: 404, body: { detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "Unknown or expired round." } } } };
    })();
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  });
  const locks = () => calls.filter((c) => c.path.endsWith("/lock"));
  const deals = () => calls.filter((c) => c.path === "/deal");
  return { fetchImpl, calls, locks, deals };
}

function mount(be: ReturnType<typeof standIn>) {
  const api = perfectTimingApi({ fetchImpl: be.fetchImpl as unknown as typeof fetch, sleep: async () => {} });
  return render(<MemoryRouter><PerfectTimingPage api={api} initialMode="random" /></MemoryRouter>);
}

function key(el: Element, t: number, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, "timeStamp", { value: t });
  fireEvent(el, e);
}

let clock = 10_000;
const seal = () => screen.getByTestId("pt-press-surface");

async function armed() {
  await waitFor(() => expect(seal()).toHaveAttribute("data-phase", "armed"));
}

/** Cast and stop the current round at exactly `elapsed` ms. */
function time(elapsed: number) {
  const t0 = (clock += 5_000);
  key(seal(), t0);
  key(seal(), t0 + elapsed);
}

function currentChampionText() {
  return screen.getByTestId("pt-prompt").textContent ?? "";
}

beforeEach(() => { play.mockClear(); clock = 10_000; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("PerfectTimingPage — the integrated owner run", () => {
  it("plays the captured five-round run: deal → time → lock → reveal → next → results", async () => {
    const be = standIn();
    mount(be);
    for (let i = 0; i < LOCKS.length; i++) {
      await armed();
      const wire = (capture.deal.response.rounds as Json[])[i];
      expect(currentChampionText()).toContain(wire.ability_name);
      // Answer isolation: nothing about this round's cooldown is on the page before its lock.
      const raw = LOCKS[i].response.authority.cooldown_raw as string;
      expect(document.body.textContent).not.toContain(raw);
      time(LOCKS[i].request.elapsed_ms);
      await waitFor(() => expect(screen.getByTestId("pt-reveal-stage")).toBeInTheDocument());
      expect(document.body.textContent).toContain(raw);
      fireEvent.click(screen.getByRole("button", { name: i === LOCKS.length - 1 ? /see results/i : /next round/i }), { detail: 1 });
    }
    const results = await screen.findByTestId("pt-results");
    expect(results).toHaveAttribute("data-total-points", String(LOCKS.reduce((n, l) => n + l.response.points, 0)));
    expect(be.deals()).toHaveLength(1);
    expect(be.deals()[0].body).toEqual({ count: 5 });
    // Exactly one lock per round, each carrying exactly the stopped time for ITS round.
    expect(be.locks().map((c) => [c.path, c.body])).toEqual(
      LOCKS.map((l) => [`/rounds/${l.round_id}/lock`, { elapsed_ms: l.request.elapsed_ms }]),
    );
    // PT1 owns the cues: one start, one cast, one lock, one verdict per round; the page adds none.
    const cues = play.mock.calls.map((c) => c[0]);
    expect(cues.filter((c) => c === "ranked.module.start")).toHaveLength(5);
    expect(cues.filter((c) => c === "perfect-timing.cast")).toHaveLength(5);
    expect(cues.filter((c) => c === "perfect-timing.lock")).toHaveLength(5);
    expect(cues.filter((c) => c === "ranked.answer.lock")).toHaveLength(0);
    expect(cues.filter((c) => c === "ranked.answer.correct")).toHaveLength(4);
    expect(cues.filter((c) => c === "ranked.answer.incorrect")).toHaveLength(1);
  });

  it("submits once per round: a repeated stop, a pointer+key pair and key repeat never lock twice", async () => {
    const be = standIn();
    mount(be);
    await armed();
    const t0 = (clock += 5_000);
    key(seal(), t0);
    key(seal(), t0 + LOCKS[0].request.elapsed_ms);
    key(seal(), t0 + LOCKS[0].request.elapsed_ms + 20); // same physical press, second delivery
    key(seal(), t0 + LOCKS[0].request.elapsed_ms + 900); // a late extra press
    key(seal(), t0 + LOCKS[0].request.elapsed_ms + 950, { repeat: true });
    await screen.findByTestId("pt-reveal-stage");
    expect(be.locks()).toHaveLength(1);
  });

  it("PT5.2: while the clock runs the only digits on the stage are the chronometer's own; no Ranked timer", async () => {
    mount(standIn());
    await armed();
    key(seal(), (clock += 5_000));
    expect(seal()).toHaveAttribute("data-phase", "running");
    const stage = screen.getByTestId("pt-stage").cloneNode(true) as HTMLElement;
    expect(stage.querySelector('[data-testid="pt-chrono-digits"]')?.textContent).toMatch(/^\d+\.\d\d$/);
    stage.querySelector('[data-testid="pt-chrono-digits"]')?.remove();
    // Round 1 is rank-invariant ("any rank"), so the rest of the stage prints no digit at all.
    expect(stage.textContent ?? "").not.toMatch(/\d/);
    expect(screen.queryByTestId("timer-value")).toBeNull();
    expect(screen.getByTestId("pt-stage").querySelectorAll(".animate-pulse")).toHaveLength(0);
  });

  it("voids an interrupted attempt without submitting, then continues to the next round", async () => {
    const be = standIn();
    mount(be);
    await armed();
    key(seal(), (clock += 5_000));
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    vis.mockRestore();
    await waitFor(() => expect(screen.getByTestId("perfect-timing-page")).toHaveAttribute("data-stage", "voided"));
    expect(screen.getByTestId("pt-status")).toHaveTextContent(/Run interrupted — round voided/);
    const next = screen.getByTestId("pt-continue");
    expect(next).toHaveFocus();
    // A press on the voided seal does nothing.
    key(seal(), (clock += 3_000));
    expect(be.locks()).toHaveLength(0);
    fireEvent.click(next);
    await armed();
    expect(currentChampionText()).toContain("Lucent Singularity");
    expect(screen.getByTestId("pt-pips").querySelector('[data-tier="voided"]')).not.toBeNull();
    expect(be.locks()).toHaveLength(0);
  });

  it("PT5.2: the chronometer reads 0.00 armed, ignores a double-tap, freezes on the engine's stop, and the lock carries the engine's interval", async () => {
    const be = standIn();
    mount(be);
    await armed();
    const digits = () => screen.getByTestId("pt-chrono-digits").textContent;
    expect(digits()).toBe("0.00");
    const elapsed = LOCKS[0].request.elapsed_ms as number;
    const t0 = (clock += 5_000);
    key(seal(), t0);
    expect(seal()).toHaveAttribute("data-phase", "running");
    // A second press inside the minimum run is a double-tap: still running, nothing frozen, nothing sent.
    key(seal(), t0 + MIN_RUN_MS - 1);
    expect(seal()).toHaveAttribute("data-phase", "running");
    expect(screen.getByTestId("pt-chrono")).toHaveAttribute("data-readout", "running");
    key(seal(), t0 + elapsed);
    // Frozen at once on the engine's measurement (jsdom's frame clock is nowhere near these stamps).
    expect(digits()).toBe(formatLocked(elapsed));
    expect(screen.getByTestId("pt-status")).toHaveTextContent(`Locked at ${formatLocked(elapsed)} s.`);
    await screen.findByTestId("pt-reveal-stage");
    expect(be.locks().map((c) => c.body)).toEqual([{ elapsed_ms: elapsed }]);
    fireEvent.click(screen.getByRole("button", { name: /next round/i }), { detail: 1 });
    await armed();
    expect(digits()).toBe("0.00");
  });

  it("deals a fresh round when the lock answers 404 (expired), at the same position", async () => {
    const be = standIn((path, _b, n) => (path.endsWith("/lock") && n === 1
      ? { status: 404, body: { detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "Unknown or expired round." } } } }
      : undefined));
    mount(be);
    await armed();
    time(LOCKS[0].request.elapsed_ms);
    await armed();
    expect(be.deals().map((d) => d.body)).toEqual([{ count: 5 }, { count: 1 }]);
    expect(screen.getByTestId("pt-pips")).toHaveAttribute("aria-label", "Round 1 of 5");
    expect(currentChampionText()).toContain("Disintegrate");
    // 404 is never retried.
    expect(be.locks()).toHaveLength(1);
  });

  it("replaces a round whose expiry passed before it was armed, without locking it", async () => {
    const be = standIn((path, body) => {
      if (path !== "/deal" || body.count !== 5) return undefined;
      const deal = clone(capture.deal.response) as Json;
      deal.rounds.forEach((r: Json, i: number) => { r.expires_at = i === 1 ? "2020-01-01T00:00:00Z" : future(); });
      return { status: 200, body: deal };
    });
    mount(be);
    await armed();
    time(LOCKS[0].request.elapsed_ms);
    fireEvent.click(await screen.findByRole("button", { name: /next round/i }), { detail: 1 });
    await armed();
    expect(be.deals().map((d) => d.body)).toEqual([{ count: 5 }, { count: 1 }]);
    expect(screen.getByTestId("pt-pips")).toHaveAttribute("aria-label", "Round 2 of 5");
    expect(be.locks()).toHaveLength(1);
  });

  it("retries a lock on 503 and on a network failure, and reveals the idempotent answer", async () => {
    const be = standIn((path, _b, n) => {
      if (!path.endsWith("/lock")) return undefined;
      if (n === 1) return { status: 503, body: { detail: "busy" } };
      if (n === 2) return "network";
      return undefined;
    });
    mount(be);
    await armed();
    time(LOCKS[0].request.elapsed_ms);
    await screen.findByTestId("pt-reveal-stage");
    expect(be.locks()).toHaveLength(3);
    expect(new Set(be.locks().map((c) => c.body.elapsed_ms))).toEqual(new Set([LOCKS[0].request.elapsed_ms]));
  });

  it("never retries a 409, voids the round and moves on", async () => {
    const be = standIn((path) => (path.endsWith("/lock")
      ? { status: 409, body: { detail: { error: { code: "PT_ALREADY_LOCKED", message: "already locked" } } } }
      : undefined));
    mount(be);
    await armed();
    time(LOCKS[0].request.elapsed_ms);
    const go = await screen.findByTestId("pt-void-continue");
    expect(be.locks()).toHaveLength(1);
    expect(screen.queryByTestId("pt-retry-lock")).toBeNull();
    expect(screen.getByTestId("pt-status")).toHaveTextContent(/already locked/);
    expect(go).toHaveFocus();
    fireEvent.click(go);
    await armed();
    expect(screen.getByTestId("pt-pips").querySelector('[data-tier="voided"]')).not.toBeNull();
  });

  it("after retries are exhausted, keeps the stop and lets the owner resubmit the same time", async () => {
    let down = true;
    const be = standIn((path) => (path.endsWith("/lock") && down ? "network" : undefined));
    mount(be);
    await armed();
    time(LOCKS[0].request.elapsed_ms);
    const retry = await screen.findByTestId("pt-retry-lock");
    expect(be.locks()).toHaveLength(4); // 1 + 3 retries
    expect(retry).toHaveFocus();
    down = false;
    fireEvent.click(retry);
    await screen.findByTestId("pt-reveal-stage");
    expect(be.locks()).toHaveLength(5);
    expect(new Set(be.locks().map((c) => c.body.elapsed_ms)).size).toBe(1);
  });

  it("explains a disabled lab and an unauthorized session on deal", async () => {
    mount(standIn((path) => (path === "/deal" ? { status: 404, body: { detail: { error: { code: "PT_LAB_DISABLED", message: "off" } } } } : undefined)));
    expect(await screen.findByText(/PERFECT_TIMING_LAB_ENABLED/)).toBeInTheDocument();
    cleanup();
    mount(standIn((path) => (path === "/deal" ? { status: 403, body: { detail: "Owner authorization required" } } : undefined)));
    expect(await screen.findByText(/did not accept an owner session/)).toBeInTheDocument();
  });

  it("refuses a deal that carries an answer, and draws no round from it", async () => {
    const be = standIn((path) => {
      if (path !== "/deal") return undefined;
      const deal = clone(capture.deal.response) as Json;
      deal.rounds[0].target_ms = 12000;
      return { status: 200, body: deal };
    });
    mount(be);
    expect(await screen.findByText(/could not read/)).toBeInTheDocument();
    expect(screen.queryByTestId("pt-champion")).toBeNull();
    expect(document.body.textContent).not.toContain("12000");
  });

  it("PT4.1: hosted from the Playtests hub, the top bar leads with the way back instead of Exit", async () => {
    const be = standIn();
    const api = perfectTimingApi({ fetchImpl: be.fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    render(<MemoryRouter><PerfectTimingPage api={api} initialMode="random" lead={<a data-testid="hub-lead" href="/hub">Playtests</a>} /></MemoryRouter>);
    await armed();
    const chrome = screen.getByTestId("pt-chrome");
    expect(chrome.firstElementChild).toBe(screen.getByTestId("hub-lead"));
    expect(screen.queryByRole("link", { name: "Exit" })).toBeNull();
    cleanup();
    mount(standIn());
    await armed();
    expect(screen.getByRole("link", { name: "Exit" })).toHaveAttribute("href", "/admin");
  });

  it("PT4.4: no prototype badge, banner, flank or disclaimer anywhere on the screen", async () => {
    mount(standIn());
    await armed();
    expect(screen.queryByTestId("pt-banner")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByTestId("pt-flank-run")).toBeNull();
    expect(screen.queryByTestId("pt-flank-archive")).toBeNull();
    expect(document.body.textContent).not.toMatch(/prototype|owner lab|owner-only|tamper|not part of|playtest/i);
  });

  it("PT4.4: the page is a fixed, non-scrolling screen that gives the viewport back on leaving", async () => {
    document.body.style.overflow = "auto";
    const { unmount } = mount(standIn());
    await armed();
    expect(screen.getByTestId("perfect-timing-page")).toHaveClass("pt-screen");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });

  it("PT4.4: Space never scrolls the page in any stage, and still plays the round", async () => {
    const be = standIn();
    mount(be);
    await armed();
    const prevented = (target: Element | Document, init: KeyboardEventInit, t: number) => {
      const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      Object.defineProperty(e, "timeStamp", { value: t });
      fireEvent(target, e);
      return e.defaultPrevented;
    };
    // armed and running: the document drives the timer with focus on <body>
    (document.activeElement as HTMLElement | null)?.blur();
    expect(prevented(document.body, { key: " " }, (clock += 5_000))).toBe(true);
    expect(seal()).toHaveAttribute("data-phase", "running");
    expect(prevented(document.body, { key: "Enter" }, clock + LOCKS[0].request.elapsed_ms)).toBe(true);
    await screen.findByTestId("pt-reveal-stage");
    // revealed: Space aimed at the page is swallowed by the screen, not scrolled
    expect(prevented(document.body, { key: " " }, clock + 99_000)).toBe(true);
    expect(be.locks()).toHaveLength(1);
  });

  it("PT4.4: a key that advances the reveal cannot also start the round it armed", async () => {
    const be = standIn();
    mount(be);
    await armed();
    time(LOCKS[0].request.elapsed_ms);
    const next = await screen.findByRole("button", { name: /next round/i });
    fireEvent.click(next); // detail 0: a keyboard-initiated click
    await armed();
    // the double-tap's second Space lands on the freshly armed seal / document
    (document.activeElement as HTMLElement | null)?.blur();
    key(document.body, (clock += 5_000));
    key(seal(), (clock += 40), { key: "Enter" });
    expect(seal()).toHaveAttribute("data-phase", "armed");
    expect(be.locks()).toHaveLength(1);
  });

  it("PT4.4: puts the champion's splash behind the stage and in the hero, with the ability icon", async () => {
    mount(standIn());
    await armed();
    const hero = screen.getByTestId("pt-round-plate");
    expect(hero.querySelector(".pt-hero-art img")?.getAttribute("src")).toMatch(/assets\/champions\/Ahri\/splash\/0_default\.jpg$/);
    expect(screen.getByTestId("pt-backdrop").querySelector("img")?.getAttribute("src")).toMatch(/Ahri\/splash\/0_default\.jpg$/);
    expect(screen.getByTestId("pt-hero-icon").querySelector("img")?.getAttribute("src")).toMatch(/assets\/champions\/Ahri\/E_AhriE\.png$/);
    expect(screen.getByLabelText("E ability")).toBeInTheDocument();
  });

  it("resolves ability icons through the approved asset helpers", async () => {
    mount(standIn());
    await armed();
    const img = screen.getByTestId("pt-seal-icon").querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/assets\/champions\/Ahri\/E_AhriE\.png$/);
  });
});
