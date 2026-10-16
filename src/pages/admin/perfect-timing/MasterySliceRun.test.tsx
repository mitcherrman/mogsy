/**
 * PT5 — the Mastery Slice in jsdom: the REAL api client over a stand-in
 * `fetch` that answers from the REAL backend slice capture
 * (`sliceCaptureV1.json`), the REAL PT2 engine and the REAL PT1 stage/reveal.
 * Each stop is stamped at exactly the captured `elapsed_ms`, so the stand-in
 * answers with the captured release (ids rewritten for resumed slices).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import capture from "@/lib/perfect-timing/__fixtures__/sliceCaptureV1.json";
import v1capture from "@/lib/perfect-timing/__fixtures__/captureV1.json";
import { perfectTimingApi } from "@/lib/perfect-timing/api";
import { formatSliceSeconds } from "@/components/perfect-timing/presentation";

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
      Ezreal: { icon: "assets/champions/Ezreal/icon.png", splash: "assets/champions/Ezreal/splash/0_default.jpg", loading: "", cutout: "" },
    },
  };
  return { ...real, championAssetsQuery: { ...real.championAssetsQuery, queryFn: async () => manifest } };
});

import PerfectTimingPage from "./PerfectTimingPage";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const BASE = "http://backend.test/api/admin/perfect-timing";
const LOCKS = capture.locks as Json[];
const ELAPSED = LOCKS.map((l) => l.request.elapsed_ms as number);
const TARGETS = LOCKS.map((l) => l.response.target_ms as number); // 5500, 5000, 4545
const future = () => new Date(Date.now() + 15 * 60_000).toISOString();

interface Reply { status: number; body: unknown }
type Override = (path: string, body: Json, n: number) => Reply | "network" | undefined;

/** Stand-in for PT5's slice routes. A resume mints fresh ids over the captured stages. */
function standIn(override?: Override) {
  const calls: { path: string; body: Json }[] = [];
  /** round id → stage index (0-based) and its slice. */
  const rounds = new Map<string, { i: number; slice: string }>();
  let minted = 0;
  const hex = (n: number) => n.toString(16).padStart(32, "0");
  function issue(deal: Json) {
    deal.expires_at = future();
    deal.stages.forEach((s: Json, i: number) => { if (s.round_id) rounds.set(s.round_id, { i, slice: deal.slice_id }); });
    return deal;
  }
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(BASE, "");
    const body = JSON.parse(String(init?.body ?? "{}")) as Json;
    calls.push({ path, body });
    const n = calls.filter((c) => c.path === path).length;
    const o = override?.(path, body, n);
    if (o === "network") throw new TypeError("Failed to fetch");
    const reply = o ?? (() => {
      if (path === "/slices/deal") {
        const d = clone(capture.deal.response) as Json;
        if (body.resume) {
          const from = body.resume.from_stage as number;
          d.slice_id = `pts_${hex(++minted)}`;
          d.start_stage = from;
          d.stages.forEach((s: Json) => { s.round_id = s.stage < from ? null : `pt_${hex(1000 + ++minted)}`; });
        }
        return { status: 200, body: issue(d) };
      }
      const m = path.match(/^\/slices\/([^/]+)\/rounds\/([^/]+)\/lock$/);
      const known = m && rounds.get(m[2]);
      if (known && known.slice === m[1] && body.elapsed_ms === ELAPSED[known.i]) {
        return { status: 200, body: { ...clone(LOCKS[known.i].response), slice_id: m[1], round_id: m[2], slice_expires_at: future() } };
      }
      return { status: 404, body: { detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "Unknown or expired slice round." } } } };
    })();
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  });
  const locks = () => calls.filter((c) => c.path.endsWith("/lock"));
  const deals = () => calls.filter((c) => c.path === "/slices/deal");
  return { fetchImpl, calls, locks, deals };
}

function mount(be: ReturnType<typeof standIn>, mode?: "slice") {
  const api = perfectTimingApi({ fetchImpl: be.fetchImpl as unknown as typeof fetch, sleep: async () => {} });
  return render(<MemoryRouter><PerfectTimingPage api={api} initialMode={mode} /></MemoryRouter>);
}

function key(el: Element | Document, t: number, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, "timeStamp", { value: t });
  fireEvent(el, e);
}

let clock = 10_000;
const seal = () => screen.getByTestId("pt-press-surface");
async function armed() {
  await waitFor(() => expect(seal()).toHaveAttribute("data-phase", "armed"));
}
function time(elapsed: number, target: Element | Document = seal(), init: KeyboardEventInit = {}) {
  const t0 = (clock += 5_000);
  key(target, t0, init);
  key(target, t0 + elapsed, init);
}
const next = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }), { detail: 1 });
/** The slice prints at the graded precision: 5500 → "5.50 s", 4545 → "4.545 s". */
const seconds = formatSliceSeconds;

beforeEach(() => { play.mockClear(); clock = 10_000; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Perfect Timing — mode pick", () => {
  it("opens on the two modes and deals nothing until one is chosen", async () => {
    const be = standIn();
    mount(be);
    const pick = screen.getByTestId("pt-mode-select");
    expect(pick).toBeInTheDocument();
    expect(screen.getByTestId("pt-mode-random")).toHaveFocus();
    expect(be.calls).toHaveLength(0);
    fireEvent.click(screen.getByTestId("pt-mode-slice"));
    await armed();
    expect(be.deals()).toHaveLength(1);
    expect(be.deals()[0].body).toEqual({});
  });

  it("Random Run still deals five through the v1 route", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${String(input).replace(BASE, "")} ${init?.body}`);
      const deal = clone(v1capture.deal.response) as Json;
      for (const r of deal.rounds) r.expires_at = future();
      return new Response(JSON.stringify(deal), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const api = perfectTimingApi({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} });
    render(<MemoryRouter><PerfectTimingPage api={api} /></MemoryRouter>);
    fireEvent.click(screen.getByTestId("pt-mode-random"));
    await armed();
    expect(calls).toEqual(['/deal {"count":5}']);
    expect(screen.queryByTestId("pt-slice-track")).toBeNull();
  });

  it("arrow keys move between the modes", () => {
    mount(standIn());
    fireEvent.keyDown(screen.getByTestId("pt-mode-random"), { key: "ArrowRight" });
    expect(screen.getByTestId("pt-mode-slice")).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("pt-mode-slice"), { key: "ArrowRight" });
    expect(screen.getByTestId("pt-mode-random")).toHaveFocus();
  });
});

describe("Mastery Slice — the integrated run", () => {
  it("plays foundation → rank up → equipped on ONE ability, revealing each truth only after its lock", async () => {
    const be = standIn();
    mount(be, "slice");
    const stages = ["foundation", "rank_up", "equipped"];
    for (let i = 0; i < 3; i++) {
      await armed();
      // Same champion and ability on every stage; the art and icon too.
      expect(screen.getByTestId("pt-champion")).toHaveTextContent("Ezreal");
      expect(screen.getByTestId("pt-ability")).toHaveTextContent("Mystic Shot");
      expect(screen.getByTestId("pt-round-plate")).toHaveAttribute("data-slice", stages[i]);
      expect(screen.getByTestId(`pt-slice-step-${stages[i]}`)).toHaveAttribute("data-state", "current");
      expect(screen.getByTestId("pt-rank-value")).toHaveTextContent(`Rank ${i === 0 ? 1 : 3} / 5`);
      expect(screen.getByTestId("pt-hero-icon").querySelector("img")).not.toBeNull();
      // Answer isolation: this stage's truth is nowhere on the page before its lock.
      const text = document.body.textContent ?? "";
      expect(text).not.toContain(seconds(TARGETS[i]));
      expect(text).not.toContain("4.545");
      expect(text).not.toContain("5.5 / 5.25");
      if (i === 2) {
        expect(screen.getByTestId("pt-item-name")).toHaveTextContent("Sheen");
        expect(screen.getByTestId("pt-item-haste")).toHaveTextContent("+10 Ability Haste");
        expect(screen.getByTestId("pt-item-icon").getAttribute("src")).toMatch(/assets\/items\/3057\.png$/);
        expect(screen.getByTestId("pt-item-chip")).toHaveAttribute("data-changed", "true");
      } else {
        expect(screen.queryByTestId("pt-item-chip")).toBeNull();
      }
      if (i === 1) {
        expect(screen.getByTestId("pt-rank-value")).toHaveAttribute("data-changed", "true");
        expect(screen.getByTestId("pt-rank-from")).toHaveTextContent("from 1");
      }
      time(ELAPSED[i]);
      await screen.findByTestId("pt-reveal-stage");
      expect(screen.getByTestId("pt-true-time")).toHaveTextContent(seconds(TARGETS[i]));
      const delta = screen.getByTestId("pt-slice-delta");
      if (i === 1) {
        expect(delta).toHaveTextContent("Rank 1 → 3");
        expect(delta).toHaveTextContent(`${seconds(5500)} → ${seconds(5000)}`);
        expect(screen.getByTestId("pt-slice-change")).toHaveTextContent("−0.50 s");
      }
      if (i === 2) {
        expect(screen.getByTestId("pt-slice-math")).toHaveTextContent("5.000 s × 100 ÷ (100 + 10) = 4.545 s");
        expect(delta).toHaveTextContent("Sheen +10 AH");
        expect(screen.getByTestId("pt-evidence")).toHaveTextContent("Base cooldown 5 s · rank 3 · cast without cooldown refunds");
      }
      next(i === 2 ? /see results/i : /next stage/i);
    }
    const results = await screen.findByTestId("pt-results");
    expect(results).toHaveAttribute("data-mode", "slice");
    expect(results).toHaveAttribute("data-total-points", String(LOCKS.reduce((n, l) => n + l.response.points, 0)));
    expect(screen.getByTestId("pt-slice-subject")).toHaveTextContent("Ezreal");
    expect(screen.getByTestId("pt-slice-story")).toHaveTextContent("Rank 1 → 3: −0.50 s · Sheen +10 AH: −0.455 s");
    expect(screen.getByTestId("pt-ladder-stage-equipped")).toHaveTextContent("Equipped Sheen +10 AH");
    expect(screen.getByTestId("pt-ladder-delta-rank_up")).toHaveTextContent("true −0.50 s");
    expect(screen.getByTestId("pt-ladder-item")).toBeInTheDocument();
    // One deal, three locks, each with ITS stage's id and stop.
    expect(be.deals()).toHaveLength(1);
    const dealt = capture.deal.response.stages.map((s) => s.round_id);
    expect(be.locks().map((c) => [c.path.split("/")[4], c.body.elapsed_ms])).toEqual(dealt.map((id, i) => [id, ELAPSED[i]]));
  });

  it("the stage prints no digit but the rank, its count and the item's haste while timing", async () => {
    mount(standIn(), "slice");
    for (let i = 0; i < 3; i++) {
      await armed();
      key(seal(), (clock += 5_000));
      expect(seal()).toHaveAttribute("data-phase", "running");
      const digits = (screen.getByTestId("pt-stage").textContent ?? "").match(/\d+/g) ?? [];
      // Public inputs only: rank, rank count, the previous rank ("from 1"), the item's haste.
      expect(new Set(digits)).toEqual(new Set([["1", "5"], ["3", "5", "1"], ["3", "5", "10"]][i]));
      key(seal(), clock + ELAPSED[i]);
      await screen.findByTestId("pt-reveal-stage");
      next(i === 2 ? /see results/i : /next stage/i);
    }
  });

  it("Enter anywhere on the page casts and stops; a repeated stop never locks twice", async () => {
    const be = standIn();
    mount(be, "slice");
    await armed();
    const t0 = (clock += 5_000);
    key(document, t0, { key: "Enter" });
    key(document, t0 + ELAPSED[0], { key: "Enter" });
    key(document, t0 + ELAPSED[0] + 20, { key: "Enter" });
    key(seal(), t0 + ELAPSED[0] + 900);
    key(document, t0 + ELAPSED[0] + 950, { key: "Enter", repeat: true });
    await screen.findByTestId("pt-reveal-stage");
    expect(be.locks()).toHaveLength(1);
  });

  it("an interrupted stage is voided, never sent, and the slice goes on with the same ability", async () => {
    const be = standIn();
    mount(be, "slice");
    await armed();
    key(seal(), (clock += 5_000));
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    vis.mockRestore();
    await waitFor(() => expect(screen.getByTestId("perfect-timing-page")).toHaveAttribute("data-stage", "voided"));
    expect(be.locks()).toHaveLength(0);
    fireEvent.click(screen.getByTestId("pt-continue"));
    await armed();
    expect(screen.getByTestId("pt-round-plate")).toHaveAttribute("data-slice", "rank_up");
    expect(screen.getByTestId("pt-champion")).toHaveTextContent("Ezreal");
    time(ELAPSED[1]);
    await screen.findByTestId("pt-reveal-stage");
    // Foundation was never revealed, so its cooldown is not compared.
    expect(screen.getByTestId("pt-slice-delta")).toHaveTextContent("Foundation voided");
    expect(document.body.textContent).not.toContain(seconds(5500));
    expect(screen.getByTestId("pt-pips").querySelector('[data-tier="voided"]')).not.toBeNull();
  });

  it("an expired stage re-deals the SAME ability from that stage, keeping earlier results", async () => {
    const be = standIn((path, _b, n) => (path.endsWith("/lock") && n === 1 && path.includes(capture.deal.response.stages[1].round_id)
      ? { status: 404, body: { detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "Unknown or expired slice round." } } } }
      : undefined));
    mount(be, "slice");
    await armed();
    time(ELAPSED[0]);
    await screen.findByTestId("pt-reveal-stage");
    next(/next stage/i);
    await armed();
    time(ELAPSED[1]);
    await armed();
    expect(be.deals().map((d) => d.body)).toEqual([{}, { resume: {
      champion: "Ezreal", slot: "Q", from_stage: 2,
      ability_revision_id: capture.deal.response.authority.ability_revision_id,
      item_source_revision: capture.deal.response.authority.item_source_revision,
    } }]);
    expect(screen.getByTestId("pt-round-plate")).toHaveAttribute("data-slice", "rank_up");
    expect(screen.getByTestId("pt-champion")).toHaveTextContent("Ezreal");
    time(ELAPSED[1]);
    await screen.findByTestId("pt-reveal-stage");
    // Foundation's truth was legitimately revealed before the resume: still compared.
    expect(screen.getByTestId("pt-slice-delta")).toHaveTextContent(`${seconds(5500)} → ${seconds(5000)}`);
    expect(screen.getByTestId("pt-pips").querySelectorAll("[data-tier]").length).toBe(2);
  });

  it("re-deals before arming when the slice expired while a reveal was open", async () => {
    const be = standIn();
    mount(be, "slice");
    await armed();
    time(ELAPSED[0]);
    await screen.findByTestId("pt-reveal-stage");
    const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now + 16 * 60_000);
    next(/next stage/i);
    await waitFor(() => expect(be.deals()).toHaveLength(2));
    spy.mockRestore();
    await armed();
    expect(be.deals()[1].body.resume.from_stage).toBe(2);
    expect(be.locks()).toHaveLength(1);
  });

  it("when the data changed, the resume is refused and only a new slice is offered", async () => {
    const be = standIn((path, body) => {
      if (path.endsWith("/lock") && path.includes(capture.deal.response.stages[0].round_id)) {
        return { status: 404, body: { detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "gone" } } } };
      }
      if (path === "/slices/deal" && body.resume) {
        return { status: 409, body: { detail: { error: { code: "PT_SLICE_RESUME_REFUSED", message: "changed" } } } };
      }
      return undefined;
    });
    mount(be, "slice");
    await armed();
    time(ELAPSED[0]);
    const fresh = await screen.findByTestId("pt-new-slice");
    expect(screen.getByTestId("pt-status")).toHaveTextContent(/data changed/);
    expect(fresh).toHaveFocus();
    fireEvent.click(fresh);
    await armed();
    expect(be.deals().map((d) => d.body)).toEqual([{}, expect.objectContaining({ resume: expect.any(Object) }), {}]);
  });

  it("a resume that names another ability is refused by the client", async () => {
    const be = standIn((path, body) => {
      if (path.endsWith("/lock")) return { status: 404, body: { detail: { error: { code: "PT_ROUND_NOT_FOUND", message: "gone" } } } };
      if (path === "/slices/deal" && body.resume) {
        const d = clone(capture.resume.response) as Json;
        d.champion = "Lux";
        d.start_stage = 1;
        d.stages.forEach((s: Json, i: number) => { s.round_id = `pt_${String(i + 7).padStart(32, "a")}`; });
        d.expires_at = future();
        return { status: 200, body: d };
      }
      return undefined;
    });
    mount(be, "slice");
    await armed();
    time(ELAPSED[0]);
    await screen.findByTestId("pt-retry-deal");
    expect(screen.getByTestId("pt-status")).toHaveTextContent(/resumed a different slice/);
    expect(screen.getByTestId("pt-champion")).toHaveTextContent("Ezreal");
  });

  it("a 409 on lock voids the stage; a 503 is retried with the same stop", async () => {
    const be = standIn((path, _b, n) => {
      if (!path.endsWith("/lock")) return undefined;
      if (path.includes(capture.deal.response.stages[0].round_id)) {
        return n === 1 ? { status: 503, body: { detail: "busy" } } : undefined;
      }
      return { status: 409, body: { detail: { error: { code: "PT_STAGE_CLOSED", message: "closed" } } } };
    });
    mount(be, "slice");
    await armed();
    time(ELAPSED[0]);
    await screen.findByTestId("pt-reveal-stage");
    expect(be.locks().map((c) => c.body.elapsed_ms)).toEqual([ELAPSED[0], ELAPSED[0]]);
    next(/next stage/i);
    await armed();
    time(ELAPSED[1]);
    const go = await screen.findByTestId("pt-void-continue");
    expect(screen.queryByTestId("pt-retry-lock")).toBeNull();
    expect(go).toHaveTextContent(/next stage/i);
  });

  it("refuses a slice deal that carries an answer and draws nothing from it", async () => {
    const be = standIn((path) => {
      if (path !== "/slices/deal") return undefined;
      const d = clone(capture.deal.response) as Json;
      d.stages[0].target_ms = 5500;
      d.expires_at = future();
      return { status: 200, body: d };
    });
    mount(be, "slice");
    expect(await screen.findByText(/could not read/)).toBeInTheDocument();
    expect(screen.queryByTestId("pt-champion")).toBeNull();
    expect(document.body.textContent).not.toContain("5500");
  });

  it("results offer a new slice and the way back to the mode pick", async () => {
    const be = standIn();
    mount(be);
    fireEvent.click(screen.getByTestId("pt-mode-slice"));
    for (let i = 0; i < 3; i++) {
      await armed();
      time(ELAPSED[i]);
      await screen.findByTestId("pt-reveal-stage");
      next(i === 2 ? /see results/i : /next stage/i);
    }
    await screen.findByTestId("pt-results");
    expect(screen.getByTestId("pt-play-again")).toHaveTextContent("New slice");
    fireEvent.click(screen.getByTestId("pt-exit"));
    expect(screen.getByTestId("pt-mode-select")).toBeInTheDocument();
  });
});
