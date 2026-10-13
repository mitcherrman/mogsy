/**
 * UX1 — the Worlds experience shell: Overview and Stage Explorer navigation,
 * direction of travel, deep links, browser history, match selection, the
 * stage presentations on real and simulated data, honest degraded states,
 * keyboard, reduced motion and the phone sheet.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import {
  KO,
  PI,
  WORLDS_PRE,
  clone,
  knockoutMid,
  partialSchedule,
  playInDay1,
  staleSchedule,
  standingsUnavailable,
  swissThrough,
  unknownPhase,
  worldsComplete,
} from "@/lib/pro-play/__fixtures__/worldsScenarios";
import type { TournamentResponseV2 } from "@/lib/pro-play/tournamentApi";

import WorldsExperience from "./WorldsExperience";

const mocks = vi.hoisted(() => ({ reduced: false }));
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: () => mocks.reduced };
});

const BASE = "/lol/dev/worlds-experience";
const NOW = Date.parse("2026-10-13T00:10:00Z");

let loc = { pathname: "", search: "", state: null as unknown };
let nav: NavigateFunction = () => {};
function Probe() {
  const l = useLocation();
  const n = useNavigate();
  useEffect(() => {
    loc = { pathname: l.pathname, search: l.search, state: l.state };
    nav = n;
  });
  return null;
}

function renderAt(path: string, { data = WORLDS_PRE, desktop = true, now = NOW }: { data?: TournamentResponseV2; desktop?: boolean; now?: number } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Routes>
        <Route path={`${BASE}/*`} element={<WorldsExperience data={data} now={now} base={BASE} desktop={desktop} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const workspace = () => screen.getByTestId("workspace");
const currentScreen = () => workspace().getAttribute("data-screen");
const card = (id: string) => document.querySelector(`[data-bracket-match="${id}"]`) as HTMLElement;
const select = (id: string) => fireEvent.click(within(card(id)).getByRole("button"));
const params = () => new URLSearchParams(loc.search);
const back = () => act(() => nav(-1));
/** The detail on screen once any outgoing panel content has left. */
async function detail() {
  await waitFor(() => expect(screen.getAllByTestId("match-detail")).toHaveLength(1));
  return screen.getByTestId("match-detail");
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  __resetProPlayMediaCache();
  mocks.reduced = false;
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, identity_available: true, results: [] }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ── shell and navigation ───────────────────────────────────────────────── */

describe("primary navigation", () => {
  it("lands on the Overview, with all five destinations and only two of them links", () => {
    renderAt(BASE);
    expect(currentScreen()).toBe("overview");
    const links = screen.getAllByTestId("nav-screen");
    expect(links.map((a) => a.getAttribute("data-screen"))).toEqual(["overview", "stages"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    const future = screen.getAllByTestId("nav-future");
    expect(future.map((el) => el.getAttribute("data-screen"))).toEqual(["teams", "schedule", "discover"]);
    for (const el of future) {
      expect(el.tagName).not.toBe("A");
      expect(el).toHaveAttribute("aria-disabled", "true");
      expect(el.closest("a")).toBeNull();
    }
  });

  it("moves to Stages rightward and back leftward, through the browser's history", async () => {
    renderAt(`${BASE}?scenario=snapshot`);
    fireEvent.click(screen.getAllByTestId("nav-screen")[1]);
    expect(loc.pathname).toBe(`${BASE}/stages`);
    expect(params().get("scenario")).toBe("snapshot");
    expect(currentScreen()).toBe("stages");
    expect(workspace()).toHaveAttribute("data-direction", "1");
    back();
    await waitFor(() => expect(currentScreen()).toBe("overview"));
    expect(workspace()).toHaveAttribute("data-direction", "-1");
    act(() => nav(1));
    await waitFor(() => expect(currentScreen()).toBe("stages"));
    expect(workspace()).toHaveAttribute("data-direction", "1");
  });

  it("corrects a future screen's path to the Overview instead of drawing it", async () => {
    renderAt(`${BASE}/teams?scenario=snapshot`);
    await waitFor(() => expect(loc.pathname).toBe(BASE));
    expect(params().get("scenario")).toBe("snapshot");
    expect(currentScreen()).toBe("overview");
  });

  it("announces where the reader is", async () => {
    renderAt(`${BASE}/stages/swiss`);
    await waitFor(() => expect(screen.getByTestId("announcer")).toHaveTextContent("Stages: Swiss"));
  });
});

describe("stage selection", () => {
  it("opens on the stage in play or next, and switches stage by its own direction", async () => {
    renderAt(`${BASE}/stages`);
    expect(screen.getByTestId("stage-view")).toHaveAttribute("data-stage", "play_in");
    const tabs = screen.getAllByTestId("stage-tab");
    expect(tabs.map((t) => t.getAttribute("data-stage"))).toEqual(["play_in", "swiss", "knockout"]);
    expect(tabs[0]).toHaveAttribute("aria-current", "page");
    expect(tabs[0]).toHaveAttribute("data-progress", "next");

    fireEvent.click(tabs[2]);
    expect(loc.pathname).toBe(`${BASE}/stages/knockouts`);
    await waitFor(() => expect(screen.getByTestId("stage-view")).toHaveAttribute("data-stage", "knockout"));
    expect(screen.getByTestId("stage-view")).toHaveAttribute("data-direction", "1");
    expect(workspace()).toHaveAttribute("data-direction", "0");

    fireEvent.click(screen.getAllByTestId("stage-tab")[1]);
    await waitFor(() => expect(screen.getByTestId("stage-view")).toHaveAttribute("data-stage", "swiss"));
    expect(screen.getByTestId("stage-view")).toHaveAttribute("data-direction", "-1");

    back();
    await waitFor(() => expect(screen.getByTestId("stage-view")).toHaveAttribute("data-stage", "knockout"));
    back();
    await waitFor(() => expect(screen.getByTestId("stage-view")).toHaveAttribute("data-stage", "play_in"));
  });

  it("replaces an unknown stage slug with the default stage", async () => {
    renderAt(`${BASE}/stages/groups?scenario=x`);
    await waitFor(() => expect(loc.pathname).toBe(`${BASE}/stages/play-in`));
    expect(params().get("scenario")).toBe("x");
  });

  it("deep-links straight to a stage with a selected match", () => {
    renderAt(`${BASE}/stages/knockouts?match=${KO.final}`);
    expect(screen.getByTestId("stage-view")).toHaveAttribute("data-stage", "knockout");
    expect(screen.getByTestId("context-panel")).toHaveAttribute("data-mode", "match");
    expect(screen.getByTestId("match-detail")).toHaveAttribute("data-match-id", KO.final);
  });

  it("ignores a match id the event does not have", () => {
    renderAt(`${BASE}/stages/play-in?match=nope`);
    expect(screen.getByTestId("context-panel")).toHaveAttribute("data-mode", "brief");
  });
});

/* ── Overview ───────────────────────────────────────────────────────────── */

describe("Overview", () => {
  it("before Worlds: the next match with its countdown, the road and the Play-In stakes", () => {
    renderAt(BASE);
    const hero = screen.getByTestId("overview-hero");
    expect(hero).toHaveAttribute("data-focus", "next");
    expect(within(hero).getAllByTestId("hero-team").map((t) => t.getAttribute("data-team"))).toEqual(["C9", "KC"]);
    expect(within(hero).getByTestId("hero-caption")).toHaveTextContent(/Play-In · Upper Semifinal 1 · Bo5/);
    expect(within(hero).getByTestId("countdown")).toHaveAccessibleName("Starts in 2 days 17 hrs 50 min");

    const road = screen.getAllByTestId("road-stage");
    expect(road.map((r) => r.getAttribute("data-progress"))).toEqual(["next", "none", "none"]);
    expect(road.map((r) => within(r).getByTestId("road-stakes").textContent)).toEqual([
      "4 teams · Bo5 · 1 advances",
      "16 teams · Bo1 / Bo3 · 8 advance",
      "8 teams · Bo5 · 1 champion",
    ]);

    const stakes = screen.getByTestId("stakes");
    expect(stakes).toHaveAttribute("data-stage", "play_in");
    expect(within(stakes).getByTestId("stake-teams")).toHaveTextContent("4");
    expect(within(stakes).getByTestId("stake-advance")).toHaveTextContent("1");
    expect(within(stakes).getByTestId("stake-eliminated")).toHaveTextContent("3");
    expect(within(stakes).getAllByTestId("stakes-team").map((t) => t.getAttribute("data-team")).sort()).toEqual(["C9", "FUR", "KC", "MVK"]);
    // No prediction, no history, no records before a match is played.
    expect(screen.queryByText(/favou?rite|predict|win probability/i)).toBeNull();
  });

  it("'View in the bracket' opens the Play-In with that match selected (a history entry)", async () => {
    renderAt(BASE);
    fireEvent.click(screen.getByTestId("hero-open-bracket"));
    expect(loc.pathname).toBe(`${BASE}/stages/play-in`);
    expect(params().get("match")).toBe(PI.ubsf1);
    expect(card(PI.ubsf1)).toHaveAttribute("data-selected", "true");
    back();
    await waitFor(() => expect(currentScreen()).toBe("overview"));
  });

  it("a fixture opens its match in the Stage Explorer", () => {
    renderAt(BASE);
    const fixture = screen.getAllByTestId("fixture")[0];
    fireEvent.click(fixture);
    expect(params().get("match")).toBe(fixture.getAttribute("data-match-id"));
    expect(screen.getByTestId("match-detail")).toBeInTheDocument();
  });

  it("follows the event: live score, the changeover, the champion, and no schedule", () => {
    renderAt(BASE, { data: playInDay1(), now: Date.parse("2026-10-15T23:30:00Z") });
    expect(screen.getByTestId("overview-hero")).toHaveAttribute("data-focus", "live");
    expect(screen.getByTestId("hero-score")).toHaveTextContent("1–1");
    expect(screen.getByTestId("phase-chip")).toHaveTextContent(/Play-In live/i);
    cleanup();

    renderAt(BASE, { data: worldsComplete() });
    expect(screen.getByTestId("hero-champion")).toBeInTheDocument();
    expect(screen.getAllByTestId("road-stage").every((r) => r.getAttribute("data-progress") === "complete")).toBe(true);
    cleanup();

    renderAt(BASE, { data: unknownPhase() });
    expect(screen.getByTestId("overview-hero")).toHaveAttribute("data-focus", "unavailable");
    expect(screen.getByTestId("status-unknown")).toBeInTheDocument();
    expect(screen.queryByTestId("countdown")).toBeNull();
  });
});

/* ── Stage Explorer ─────────────────────────────────────────────────────── */

describe("match selection and the detail panel", () => {
  it("selects a card, shows the detail beside the bracket, and steps along its edges", async () => {
    renderAt(`${BASE}/stages/play-in`);
    expect(screen.getByTestId("context-panel")).toHaveAttribute("data-mode", "brief");
    select(PI.ubsf1);
    expect(params().get("match")).toBe(PI.ubsf1);
    expect(loc.state).toEqual({ ux1Panel: true });
    expect(card(PI.ubsf1)).toHaveAttribute("data-selected", "true");
    const panel = await detail();
    expect(within(panel).getAllByTestId("detail-side").map((s) => s.getAttribute("data-team"))).toEqual(["C9", "KC"]);
    expect(within(panel).getByTestId("onward-winner")).toHaveTextContent("Upper Final");
    expect(within(panel).getByTestId("onward-loser")).toHaveTextContent("Lower Semifinal");

    // Following an edge replaces the entry: the detail never piles up history.
    fireEvent.click(within(within(panel).getByTestId("onward-winner")).getByTestId("route-link"));
    expect(params().get("match")).toBe(PI.ubf);
    await waitFor(() => expect(screen.getAllByTestId("match-detail").map((d) => d.getAttribute("data-match-id"))).toEqual([PI.ubf]));
    const ubf = await detail();
    expect(within(ubf).getAllByTestId("slot-source-link").map((b) => b.textContent)).toEqual(["Winner of FUR v MVK", "Winner of C9 v KC"]);

    // Back closes the detail (it was one entry), and returns to the brief.
    back();
    await waitFor(() => expect(screen.getByTestId("context-panel")).toHaveAttribute("data-mode", "brief"));
    expect(params().get("match")).toBeNull();
  });

  it("closes with the close button, with Escape, and by selecting the same card again", async () => {
    renderAt(`${BASE}/stages/play-in`);
    select(PI.ubsf2);
    fireEvent.click(screen.getByTestId("detail-close"));
    await waitFor(() => expect(params().get("match")).toBeNull());

    select(PI.ubsf2);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(params().get("match")).toBeNull());

    select(PI.ubsf2);
    select(PI.ubsf2);
    await waitFor(() => expect(params().get("match")).toBeNull());
  });

  it("a deep-linked detail closes in place (no history to pop)", async () => {
    renderAt(`${BASE}/stages/play-in?match=${PI.lbsf}&scenario=snapshot`);
    expect(within(screen.getByTestId("match-detail")).getByTestId("onward-loser")).toHaveAttribute("data-kind", "eliminated");
    fireEvent.click(screen.getByTestId("detail-close"));
    await waitFor(() => expect(params().get("match")).toBeNull());
    expect(loc.pathname).toBe(`${BASE}/stages/play-in`);
    expect(params().get("scenario")).toBe("snapshot");
  });
});

describe("stage presentations", () => {
  it("Play-In: both lanes, the final, upstream edges and the Swiss end cap", () => {
    renderAt(`${BASE}/stages/play-in`);
    expect(screen.getByTestId("lane-upper")).toBeInTheDocument();
    expect(screen.getByTestId("lane-lower")).toBeInTheDocument();
    expect(within(screen.getByTestId("bracket-final")).getAllByTestId("bracket-match")).toHaveLength(1);
    expect(screen.getAllByTestId("bracket-match")).toHaveLength(6);
    expect(screen.getByTestId("swiss-end-cap")).toHaveAttribute("data-state", "unresolved");
    expect(screen.getByTestId("stage-brief")).toHaveAttribute("data-stage", "play_in");
    expect(screen.getByTestId("brief-advance")).toHaveTextContent("1");
  });

  it("Play-In results: Out only where standings say so, the winner placed at the end cap", () => {
    const d = swissThrough(1);
    renderAt(`${BASE}/stages/play-in`, { data: d });
    expect(screen.getByTestId("swiss-end-cap")).toHaveAttribute("data-state", "placed");
    const tags = screen.getAllByTestId("bracket-tag").map((t) => t.textContent);
    expect(tags.filter((t) => t === "Out")).toHaveLength(3);
  });

  it("Swiss before a result: the format's pools and certified seeding, nobody on a pool", () => {
    renderAt(`${BASE}/stages/swiss`);
    expect(screen.getAllByTestId("swiss-map-round")).toHaveLength(5);
    expect(screen.getAllByTestId("swiss-pool").map((p) => p.getAttribute("data-record"))).toEqual([
      "0-0", "1-0", "0-1", "2-0", "1-1", "0-2", "2-1", "1-2", "2-2",
    ]);
    expect(screen.queryAllByTestId("node-teams")).toHaveLength(0);
    expect(screen.getAllByTestId("swiss-tier")).toHaveLength(4);
    expect(screen.getByTestId("seed-play-in-slot")).toHaveAttribute("data-state", "unresolved");
    expect(screen.getByTestId("swiss-round")).toHaveAttribute("data-round", "1");
    expect(screen.getByTestId("swiss-round-unpaired")).toBeInTheDocument();
  });

  it("Swiss mid-event: teams on their served records, rounds selectable, pairings selectable", () => {
    const d = swissThrough(2.5);
    renderAt(`${BASE}/stages/swiss`, { data: d });
    expect(screen.getByTestId("swiss-round")).toHaveAttribute("data-round", "3");
    for (const r of d.state.swiss.records.filter((x) => x.status === "advanced")) {
      const node = document.querySelector(`[data-node="out-${r.wins}-${r.losses}"]`) as HTMLElement;
      expect(within(node).getByTestId("node-teams").querySelector(`[data-team="${r.code}"]`)).not.toBeNull();
    }
    fireEvent.click(screen.getAllByTestId("swiss-round-head")[0]);
    expect(params().get("round")).toBe("1");
    expect(screen.getByTestId("swiss-round")).toHaveAttribute("data-round", "1");
    const pairing = screen.getAllByTestId("swiss-pairing")[0];
    fireEvent.click(pairing);
    expect(params().get("match")).toBe(pairing.getAttribute("data-match-id"));
    expect(params().get("round")).toBe("1");
  });

  it("Knockouts before the draw: a schematic, not seven TBD cards", () => {
    renderAt(`${BASE}/stages/knockouts`);
    expect(screen.getByTestId("knockout-schematic")).toBeInTheDocument();
    expect(screen.getAllByTestId("schematic-node")).toHaveLength(7);
    expect(screen.queryAllByTestId("team-tbd")).toHaveLength(0);
    expect(screen.queryByTestId("knockout-bracket")).toBeNull();
    fireEvent.click(screen.getAllByTestId("schematic-node")[0]);
    expect(within(screen.getByTestId("match-detail")).getByTestId("detail-draw")).toBeInTheDocument();
  });

  it("Knockouts once placed: the published bracket, selectable, with results and Out tags", () => {
    renderAt(`${BASE}/stages/knockouts`, { data: knockoutMid() });
    expect(screen.getByTestId("knockout-bracket")).toBeInTheDocument();
    expect(screen.queryByTestId("knockout-schematic")).toBeNull();
    expect(card(KO.qf3)).toHaveAttribute("data-state", "live");
    select(KO.qf1);
    expect(within(screen.getByTestId("match-detail")).getAllByTestId("detail-score")).toHaveLength(2);
    cleanup();
    renderAt(`${BASE}/stages/knockouts`, { data: worldsComplete() });
    expect(screen.getByTestId("champion")).toBeInTheDocument();
  });
});

describe("degraded sources", () => {
  it("partial schedule: said once, and only the matches that exist are drawn", () => {
    renderAt(`${BASE}/stages/knockouts`, { data: partialSchedule() });
    expect(screen.getByTestId("status-partial")).toHaveTextContent("40 of 46");
    expect(document.querySelectorAll("[data-bracket-match]")).toHaveLength(1);
  });

  it("standings unavailable: no bracket layout, no routes, no pool map", () => {
    renderAt(`${BASE}/stages/play-in`, { data: standingsUnavailable() });
    expect(screen.getByTestId("status-standings")).toBeInTheDocument();
    expect(screen.queryByTestId("lane-upper")).toBeNull();
    expect(screen.getByTestId("bracket-list")).toBeInTheDocument();
    fireEvent.click(screen.getAllByTestId("stage-tab")[1]);
    expect(screen.getByTestId("swiss-fallback")).toBeInTheDocument();
    expect(screen.queryByTestId("swiss-map")).toBeNull();
  });

  it("stale copy: flagged with a retry, and the feed chip marked degraded", () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter initialEntries={[BASE]}>
        <Routes>
          <Route path={`${BASE}/*`} element={<WorldsExperience data={staleSchedule()} now={NOW} base={BASE} desktop onRetry={onRetry} />} />
        </Routes>
      </MemoryRouter>,
    );
    const stale = screen.getByTestId("status-stale");
    fireEvent.click(within(stale).getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.getByTestId("feed-chip")).toHaveAttribute("data-degraded", "true");
  });

  it("a background refresh failure keeps the data and says so", () => {
    render(
      <MemoryRouter initialEntries={[BASE]}>
        <Routes>
          <Route path={`${BASE}/*`} element={<WorldsExperience data={clone()} now={NOW} base={BASE} desktop refreshFailed />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("status-refresh")).toBeInTheDocument();
    expect(screen.getByTestId("overview-hero")).toHaveAttribute("data-focus", "next");
  });
});

/* ── keyboard, motion, phone ────────────────────────────────────────────── */

describe("keyboard", () => {
  it("arrow keys move along the nav rail only while focus is in it, skipping future screens", () => {
    renderAt(BASE);
    const [overview, stages] = screen.getAllByTestId("nav-screen");
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(stages).toHaveFocus();
    fireEvent.keyDown(stages, { key: "ArrowRight" });
    expect(overview).toHaveFocus();
    fireEvent.keyDown(overview, { key: "End" });
    expect(stages).toHaveFocus();
    // Focus moves; it does not navigate.
    expect(currentScreen()).toBe("overview");
  });

  it("does not take arrow keys from anywhere else", () => {
    renderAt(`${BASE}/stages/play-in`);
    const before = loc.pathname + loc.search;
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(loc.pathname + loc.search).toBe(before);
  });

  it("the stage rail roves the same way", () => {
    renderAt(`${BASE}/stages`);
    const tabs = screen.getAllByTestId("stage-tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(tabs[2]).toHaveFocus();
  });

  it("Escape is left alone while typing in a field", () => {
    renderAt(`${BASE}/stages/play-in?match=${PI.ubsf1}`);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(params().get("match")).toBe(PI.ubsf1);
    input.remove();
  });
});

describe("reduced motion", () => {
  it("marks the workspace and keeps navigation working without travel", async () => {
    mocks.reduced = true;
    renderAt(BASE);
    expect(workspace()).toHaveAttribute("data-motion", "reduced");
    fireEvent.click(screen.getAllByTestId("nav-screen")[1]);
    await waitFor(() => expect(currentScreen()).toBe("stages"));
  });

  it("full motion otherwise", () => {
    renderAt(BASE);
    expect(workspace()).toHaveAttribute("data-motion", "full");
  });
});

describe("phone layout", () => {
  it("compact bar, round stepper instead of the full graph, detail in a dismissible sheet", async () => {
    renderAt(`${BASE}/stages/play-in`, { desktop: false });
    expect(screen.getByTestId("command-bar")).toHaveAttribute("data-layout", "compact");
    expect(screen.queryByTestId("context-panel")).toBeNull();
    expect(screen.queryByTestId("lane-upper")).toBeNull();
    const steps = screen.getAllByTestId("round-step");
    expect(steps.map((s) => s.textContent)).toEqual(["Upper Semifinal", "Upper Final", "Lower Semifinal", "Lower Final", "Final"]);
    expect(steps[0]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(steps[4]);
    expect(within(screen.getByTestId("round-cards")).getAllByTestId("bracket-match")).toHaveLength(1);
    expect(screen.getByTestId("swiss-end-cap")).toBeInTheDocument();

    fireEvent.click(steps[0]);
    select(PI.ubsf1);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByTestId("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
    fireEvent.click(within(sheet).getByTestId("detail-close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(params().get("match")).toBeNull();

    select(PI.ubsf2);
    await screen.findByRole("dialog");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the phone back gesture closes the sheet", async () => {
    renderAt(`${BASE}/stages/play-in`, { desktop: false });
    select(PI.ubsf1);
    await screen.findByRole("dialog");
    back();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Swiss on a phone: round tabs and that round's pools", () => {
    renderAt(`${BASE}/stages/swiss`, { desktop: false, data: swissThrough(2.5) });
    expect(screen.getByTestId("swiss-phone")).toBeInTheDocument();
    const tabs = screen.getAllByTestId("swiss-round-tab");
    expect(tabs).toHaveLength(5);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(within(screen.getByTestId("swiss-round-pools")).getAllByTestId("swiss-pool").map((p) => p.getAttribute("data-record"))).toEqual(["2-0", "1-1", "0-2"]);
  });

  it("swipes between the built screens, but not from a sideways scroller", async () => {
    renderAt(BASE, { desktop: false });
    const ws = workspace();
    fireEvent.touchStart(ws, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(ws, { changedTouches: [{ clientX: 120, clientY: 410 }] });
    await waitFor(() => expect(currentScreen()).toBe("stages"));
    const rail = document.querySelector("[data-swipe-ignore]") as HTMLElement;
    fireEvent.touchStart(rail, { touches: [{ clientX: 120, clientY: 300 }] });
    fireEvent.touchEnd(rail, { changedTouches: [{ clientX: 330, clientY: 300 }] });
    expect(currentScreen()).toBe("stages");
    // A mostly vertical drag is a scroll, not a swipe.
    fireEvent.touchStart(workspace(), { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(workspace(), { changedTouches: [{ clientX: 180, clientY: 400 }] });
    expect(currentScreen()).toBe("stages");
  });
});
