/**
 * UX5 — the Worlds experience on a phone turned sideways (844 × 390,
 * 740 × 360): one-row command bar, controls beside content on every screen,
 * wide sheets. jsdom has no layout, so these tests pin the layout (as the
 * UX4 tests pin desktop / phone) and read the compositions; whether they fit
 * is measured in a real browser (docs/handoffs/UX4-NOSCROLL.md §8).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionGlobalConfig } from "framer-motion";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetProPlayMediaCache } from "@/components/pro-play/media/ProPlayMediaProvider";
import { PI, WORLDS_PRE, swissThrough } from "@/lib/pro-play/__fixtures__/worldsScenarios";
import type { TournamentResponseV2 } from "@/lib/pro-play/tournamentApi";

import { LANDSCAPE_QUERY } from "./ExperienceContext";
import WorldsExperience from "./WorldsExperience";

const BASE = "/lol/dev/worlds-experience";
const NOW = Date.parse("2026-10-13T00:10:00Z");

function renderAt(path: string, { data = WORLDS_PRE, landscape = true }: { data?: TournamentResponseV2; landscape?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={`${BASE}/*`} element={<WorldsExperience data={data} now={NOW} base={BASE} desktop={false} landscape={landscape} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  __resetProPlayMediaCache();
  window.sessionStorage.clear();
  // The Match Centre check reads the hub's schedule.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, identity_available: true, results: [] }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("landscape phone (UX5)", () => {
  it("the query is a short landscape screen; a desktop never takes the landscape layout", () => {
    expect(LANDSCAPE_QUERY).toBe("(orientation: landscape) and (max-height: 560px)");
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[BASE]}>
          <Routes>
            <Route path={`${BASE}/*`} element={<WorldsExperience data={WORLDS_PRE} now={NOW} base={BASE} desktop landscape />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("command-bar")).toHaveAttribute("data-layout", "wide");
    expect(screen.getByTestId("worlds-experience")).not.toHaveAttribute("data-landscape");
  });

  it("one-row command bar: identity, the five destinations and the phase in one header row", () => {
    renderAt(BASE);
    const bar = screen.getByTestId("command-bar");
    expect(bar).toHaveAttribute("data-landscape", "true");
    expect(screen.getByTestId("worlds-experience")).toHaveAttribute("data-landscape", "true");
    // The nav is a child of the bar's single row, not a second row beneath it.
    expect(within(bar).getByTestId("primary-nav").closest("header")).toBe(bar);
    expect([...bar.children].some((c) => c.contains(within(bar).getByTestId("primary-nav")) && c.contains(within(bar).getByTestId("phase-chip")))).toBe(false);
    expect(within(bar).getAllByTestId("nav-screen").map((a) => a.getAttribute("data-screen"))).toEqual(["overview", "stages", "teams", "schedule"]);
    expect(within(bar).getByRole("heading", { level: 1 })).toHaveTextContent(/Worlds/);
  });

  it("a portrait phone keeps its two-row bar", () => {
    renderAt(BASE, { landscape: false });
    expect(screen.getByTestId("command-bar")).not.toHaveAttribute("data-landscape");
    expect(screen.getByTestId("worlds-experience")).not.toHaveAttribute("data-landscape");
    expect(screen.getByTestId("overview")).toHaveAttribute("data-layout", "compact");
  });

  it("Overview: the hero beside one panel, fixtures / stakes / road as views", () => {
    renderAt(BASE);
    const overview = screen.getByTestId("overview");
    expect(overview).toHaveAttribute("data-layout", "landscape");
    expect(within(overview).getByTestId("overview-hero")).toBeInTheDocument();
    const views = within(screen.getByTestId("overview-panels")).getAllByTestId("view-tab");
    expect(views.map((v) => v.textContent)).toEqual(["Coming up", "At stake", "Road"]);
    expect(screen.getByTestId("coming-up")).toHaveAttribute("data-view", "upcoming");
    expect(screen.getAllByTestId("fixture").length).toBeGreaterThan(0);
    expect(screen.getByTestId("overview-open-schedule")).toHaveAttribute("aria-label", "Full schedule");
    fireEvent.click(views[1]);
    expect(screen.getByTestId("stakes")).toHaveAttribute("data-stage", "play_in");
    fireEvent.click(views[2]);
    // The road runs left to right: its stages side by side.
    expect(screen.getAllByTestId("road-stage")).toHaveLength(3);
  });

  it("Stages: the stage column (with the Format brief) beside the stage's presentation", async () => {
    renderAt(`${BASE}/stages/play-in`);
    const stages = screen.getByTestId("stages");
    expect(stages).toHaveAttribute("data-layout", "landscape");
    const rail = screen.getByTestId("stage-rail");
    expect(within(rail).getAllByTestId("stage-tab")).toHaveLength(3);
    expect(within(rail).getByTestId("phone-brief-open")).toBeInTheDocument();
    expect(within(rail).queryByTestId("round-step")).toBeNull();
    const area = screen.getByTestId("stage-area");
    expect(within(area).getAllByTestId("round-step")).toHaveLength(5);
    // The detail is the phone's sheet.
    fireEvent.click(within(document.querySelector(`[data-bracket-match="${PI.ubsf1}"]`) as HTMLElement).getByRole("button"));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByTestId("match-detail")).toHaveAttribute("data-match-id", PI.ubsf1);
  });

  it("Swiss: rounds and views in one row; pairings one line each, two abreast", () => {
    renderAt(`${BASE}/stages/swiss`, { data: swissThrough(2.5) });
    const phone = screen.getByTestId("swiss-phone");
    const tabs = screen.getAllByTestId("swiss-round-tab");
    const views = screen.getByTestId("swiss-phone-views");
    expect(tabs[0].parentElement!.parentElement).toBe(views.parentElement);
    expect(within(phone).getByTestId("swiss-round")).toHaveAttribute("data-round", "3");
    const pairings = within(phone).getAllByTestId("swiss-pairing");
    expect(pairings.length).toBeGreaterThan(0);
    expect(within(pairings[0]).getByTestId("pairing-state")).toBeInTheDocument();
    expect(phone.querySelector("[data-fit-list]")).toHaveClass("grid-cols-2");
  });

  it("Teams: every region in one row of chips; the team sheet puts the team beside its views", async () => {
    renderAt(`${BASE}/teams`);
    expect(screen.getByTestId("teams")).toHaveAttribute("data-layout", "landscape");
    const filter = screen.getByTestId("region-filter");
    const chips = within(filter).getAllByTestId("region-chip");
    expect(filter.style.gridTemplateColumns).toBe(`repeat(${chips.length}, minmax(0, 1fr))`);
    expect(screen.getAllByTestId("team-tile")).toHaveLength(WORLDS_PRE.context.participants.length);
    fireEvent.click(screen.getAllByTestId("team-tile")[0]);
    const sheet = await screen.findByRole("dialog");
    const focus = within(sheet).getByTestId("team-focus");
    expect(focus).toHaveAttribute("data-layout", "landscape");
    expect(within(focus).getAllByTestId("view-tab").map((v) => v.textContent?.replace(/\d+$/, ""))).toEqual(["Overview", "Matches", "Lineup"]);
    expect(within(focus).getByTestId("team-profile-link")).toBeInTheDocument();
  });

  it("Schedule: the filter and the day in a column; the date bar and the fixtures beside them", () => {
    renderAt(`${BASE}/schedule?match=${PI.ubsf1}`);
    expect(screen.getByTestId("schedule")).toHaveAttribute("data-layout", "landscape");
    const rail = screen.getByTestId("schedule-rail");
    expect(within(rail).getByTestId("schedule-filter")).toBeInTheDocument();
    expect(within(rail).getByTestId("day-header")).toHaveTextContent(/match/);
    const board = screen.getByTestId("day-board");
    expect(within(board).queryByTestId("day-header")).toBeNull();
    expect(board.getAttribute("aria-labelledby")).toBe("day-title");
    expect(document.getElementById("day-title")).not.toBeNull();
    expect(screen.getByTestId("date-rail")).toBeInTheDocument();
    expect(board.querySelector("[data-fit-list]")).toHaveClass("grid-cols-2");
    expect(screen.getAllByTestId("fixture-row").every((r) => r.closest("[data-testid='day-board']") === board)).toBe(true);
  });

  it.each([
    ["overview", ""],
    ["play-in", "/stages/play-in"],
    ["swiss", "/stages/swiss"],
    ["knockouts", "/stages/knockouts"],
    ["teams", "/teams?team=KC"],
    ["schedule", `/schedule?match=${PI.ubsf1}`],
  ])("%s: no element is a scroll container", (_name, path) => {
    renderAt(`${BASE}${path}`, { data: path.includes("swiss") ? swissThrough(2.5) : WORLDS_PRE });
    const SCROLLING = /\boverflow-(?:y-|x-)?(?:auto|scroll)\b/;
    const all = [screen.getByTestId("worlds-experience"), ...document.querySelectorAll<HTMLElement>("[data-testid='worlds-experience'] *, [role='dialog'] *")];
    expect(all.filter((el) => SCROLLING.test(el.getAttribute("class") ?? "")).map((el) => el.getAttribute("data-testid") ?? el.tagName)).toEqual([]);
  });
});
