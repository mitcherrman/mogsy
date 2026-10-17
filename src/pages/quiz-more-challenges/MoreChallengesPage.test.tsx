/**
 * PGM1/MC-UX1/MC-UX2 — `/quiz/more-challenges`, driven through a real router,
 * React Query and the real catalog and summary readers. Only the network (the
 * public catalog GET, the player summary GET and the Daily's `readToday`), the
 * session token lookup and analytics are replaced. The catalog and the
 * summary are the backend's own captured answers.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import wire from "@/lib/public-modes/__fixtures__/publicModeCatalog.json";
import summaryWire from "@/lib/public-modes/__fixtures__/playerSummary.json";
import emptySummaryWire from "@/lib/public-modes/__fixtures__/playerSummaryEmpty.json";

const NativeRequest = globalThis.Request;
class RouterTestRequest {
  readonly url: string;
  readonly method: string;
  readonly signal: AbortSignal | null;
  readonly headers: Headers;
  constructor(input: string | URL, init: RequestInit = {}) {
    this.url = String(input);
    this.method = init.method ?? "GET";
    this.signal = init.signal ?? null;
    this.headers = new Headers(init.headers);
  }
}

const h = vi.hoisted(() => ({
  readToday: vi.fn(),
  track: vi.fn(),
  fetch: vi.fn(),
  startBonusGame: vi.fn(),
  token: vi.fn(),
  ensure: vi.fn(),
}));

vi.mock("@/lib/analytics/track", () => ({ track: h.track }));
vi.mock("@/lib/ranked-public/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ranked-public/client")>();
  return { ...actual, startBonusGame: h.startBonusGame };
});
vi.mock("@/lib/daily-challenge/run/client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/daily-challenge/run/client")>();
  return { ...actual, httpDailyRunTransport: { ...actual.httpDailyRunTransport, readToday: h.readToday } };
});
vi.mock("@/lib/backend-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/backend-auth")>();
  return { ...actual, getExistingBackendAuthToken: h.token, ensureBackendAuthToken: h.ensure };
});

import MoreChallengesPage from "./MoreChallengesPage";
import { MogzyDockProvider } from "@/components/mogzy-dock/MogzyDock";
import { V5_ELIGIBLE_DAY, fixtureV5Run, wireResult } from "@/lib/daily-challenge/run/fixtures";
import { moreChallengesState } from "@/lib/public-modes/launch";
import { RankedApiError } from "@/lib/ranked-public/client";

beforeAll(() => { globalThis.Request = RouterTestRequest as unknown as typeof Request; });
afterAll(() => { globalThis.Request = NativeRequest; });

const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status,
  headers: { "Content-Type": "application/json" } }));

const mainDone = () => fixtureV5Run(V5_ELIGIBLE_DAY,
  { main_completed_at: "2026-10-16T10:00:00Z", main_score: 1234, current_stage_index: 1 },
  { 0: { status: "completed", result: wireResult() } });

let catalogBody: unknown = wire;
let summary: () => Promise<Response> = () => ok(summaryWire);

beforeEach(() => {
  catalogBody = wire;
  summary = () => ok(summaryWire);
  h.fetch.mockImplementation((url: string) =>
    String(url).endsWith("/me/summary") ? summary() : ok(catalogBody));
  vi.stubGlobal("fetch", h.fetch);
  h.readToday.mockResolvedValue(null);
  h.token.mockResolvedValue(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function Probe({ id }: { id: string }) {
  const location = useLocation();
  return <pre data-testid={id}>{JSON.stringify(location.state)}</pre>;
}

function renderPage(state: unknown = null, search = "") {
  const router = createMemoryRouter([
    { path: "/quiz/more-challenges", element: <MoreChallengesPage /> },
    { path: "/quiz/more-challenges/:mode", element: <Probe id="session-route" /> },
    { path: "/quiz/daily-challenge", element: <Probe id="daily-route" /> },
    { path: "/quiz/ranked", element: <Probe id="ranked-route" /> },
    { path: "/quiz", element: <h1>Leaguecraft</h1> },
  ], { initialEntries: [{ pathname: "/quiz/more-challenges", search, state }] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MogzyDockProvider><RouterProvider router={router} /></MogzyDockProvider>
    </QueryClientProvider>);
  return router;
}

const COLLECTION: Record<string, string> = {
  time_trial: "daily_extras", survival: "daily_extras",
  roster_lock: "knowledge_arena", draft_memory: "knowledge_arena", chronoscope: "knowledge_arena",
  match_grid: "knowledge_arena", reconstruct: "knowledge_arena", order_forge: "knowledge_arena",
  rangefinder: "precision_recall", glyph_press: "precision_recall", perfect_timing: "precision_recall",
  stat_drop: "precision_recall", combat_estimate: "precision_recall",
};
const cards = () => screen.getAllByTestId("mode-card");
const panel = () => screen.getByTestId("more-challenges-panel");
/** The card of a mode, opening its collection first if another is on screen. */
function card(id: string) {
  if (panel().getAttribute("data-collection") !== COLLECTION[id]) {
    fireEvent.click(screen.getByTestId(`more-challenges-tab-${COLLECTION[id]}`));
  }
  return cards().find((c) => c.getAttribute("data-mode-id") === id)!;
}
const ready = () => waitFor(() => expect(screen.getByTestId("more-challenges-panel")).toBeInTheDocument());
const OPEN = wire.modes.filter((m) => m.launch).map((m) => m.id);

describe("PGM1 — More Challenges", () => {
  it("draws all thirteen modes, a collection at a time, in the server's order", async () => {
    renderPage();
    await ready();
    const seen: string[] = [];
    for (const id of ["daily_extras", "knowledge_arena", "precision_recall"]) {
      fireEvent.click(screen.getByTestId(`more-challenges-tab-${id}`));
      seen.push(...cards().map((c) => c.getAttribute("data-mode-id")!));
      for (const c of cards()) {
        expect(within(c).getByTestId("mode-card-title")).toBeInTheDocument();
        expect(within(c).getByTestId("mode-card-theme")).toBeInTheDocument();
        expect(within(c).getByTestId("mode-card-summary")).toBeInTheDocument();
        expect(within(c).getByTestId("mode-card-rules")).toBeInTheDocument();
      }
    }
    expect(seen).toEqual(wire.modes.map((m) => m.id));
    expect(screen.getByTestId("more-challenges-count")).toHaveTextContent(`${OPEN.length - 2} ready to play now`);
    // The catalog read is public: no bearer, no identity.
    const [url, init] = h.fetch.mock.calls.find(([u]) => String(u).endsWith("/api/game-modes"))!;
    expect(String(url)).toMatch(/\/api\/game-modes$/);
    expect((init as RequestInit).headers).toBeUndefined();
  });

  it("with no Daily today, the bonus stages offer to start it and say why", async () => {
    renderPage();
    await ready();
    await waitFor(() => expect(within(card("time_trial")).getByTestId("mode-card-play")).toBeInTheDocument());
    for (const id of ["time_trial", "survival"]) {
      expect(within(card(id)).getByTestId("mode-card-play")).toHaveTextContent("Start Today's Daily");
      expect(within(card(id)).getByTestId("mode-card-note")).toHaveTextContent("Unlocks after today's Daily Challenge.");
    }
  });

  it("after the main Daily, Play continues the run into the current bonus stage", async () => {
    h.readToday.mockResolvedValue(mainDone());
    const router = renderPage(moreChallengesState("daily"));
    await ready();
    // A Daily visitor lands on Daily Extras.
    expect(panel()).toHaveAttribute("data-collection", "daily_extras");
    await waitFor(() => expect(within(card("time_trial")).getByTestId("mode-card-play")).toHaveTextContent("Play"));
    expect(within(card("survival")).queryByTestId("mode-card-play")).toBeNull();
    expect(within(card("survival")).getByTestId("mode-card-blocked")).toHaveTextContent("Up after Time Trial");
    expect(h.track).toHaveBeenCalledWith("more_challenges_viewed", { metadata: { source: "daily" } });
    fireEvent.click(within(card("time_trial")).getByTestId("mode-card-play"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz/daily-challenge"));
    expect(JSON.parse(screen.getByTestId("daily-route").textContent!)).toEqual({ continueDaily: true });
    expect(h.track).toHaveBeenCalledWith("more_challenges_mode_selected",
      { metadata: { game_mode_id: "time_trial", action: "play", source: "daily" } });
  });

  it("holds the Daily cards on a placeholder while the player's Daily is read", async () => {
    let resolve!: (v: null) => void;
    h.readToday.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPage();
    await ready();
    expect(within(card("time_trial")).getByTestId("mode-card-checking")).toBeInTheDocument();
    expect(screen.queryAllByTestId("mode-card-play")).toHaveLength(0);
    // Only the Daily stages wait on the Daily; a bonus game is playable at once.
    expect(within(card("match_grid")).getByTestId("mode-card-play")).toBeInTheDocument();
    await act(async () => { resolve(null); });
    await waitFor(() => expect(within(card("time_trial")).getByTestId("mode-card-play")).toBeInTheDocument());
  });

  it("opens a mode's Rules in Mogzy's scroll, from the server's copy", async () => {
    renderPage();
    await ready();
    fireEvent.click(within(card("match_grid")).getByTestId("mode-card-rules"));
    const rules = await screen.findByTestId("mode-rules-content-match_grid");
    expect(rules).toHaveTextContent("Seat each rune under the rune tree it belongs to.");
    expect(rules).toHaveTextContent("Three boards against a bot");
    expect(rules).toHaveTextContent("Each board scores 2 points only when every rune is under its own tree");
    expect(rules).toHaveTextContent("Never changes your Daily score.");
    expect(h.track).toHaveBeenCalledWith("more_challenges_mode_selected",
      { metadata: { game_mode_id: "match_grid", action: "rules", source: "direct" } });
  });

  it("an unreadable catalog says so and can be retried", async () => {
    catalogBody = {};
    h.fetch.mockImplementation((url: string) => String(url).endsWith("/me/summary") ? summary()
      : Promise.resolve(new Response("{}", { status: 503 })));
    renderPage();
    expect(await screen.findByTestId("more-challenges-error", undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryAllByTestId("mode-card")).toHaveLength(0);
    h.fetch.mockImplementation((url: string) => String(url).endsWith("/me/summary") ? summary() : ok(wire));
    fireEvent.click(screen.getByTestId("more-challenges-retry"));
    await waitFor(() => expect(cards()).toHaveLength(6));
  });

  it("lays out one column on a phone, two from sm, three (Daily Extras: two) from lg, with 44px targets", async () => {
    renderPage();
    await ready();
    expect(screen.getByTestId("more-challenges-grid-knowledge_arena").className)
      .toMatch(/grid-cols-1.*sm:grid-cols-2.*lg:grid-cols-6/);
    fireEvent.click(screen.getByTestId("more-challenges-tab-daily_extras"));
    expect(screen.getByTestId("more-challenges-grid-daily_extras").className)
      .toMatch(/grid-cols-1.*sm:grid-cols-2.*lg:grid-cols-2/);
    for (const b of screen.getAllByTestId("mode-card-play")) expect(b.className).toMatch(/min-h-\[44px\]/);
    for (const b of screen.getAllByTestId("mode-card-rules")) expect(b.className).toContain("mc-rules");
    expect(screen.getByTestId("more-challenges-back")).toHaveAttribute("href", "/quiz");
    expect(screen.getByTestId("more-challenges-back").className).toMatch(/min-h-\[44px\]/);
  });

  // ── PGM2: Ranked-backed bonus games ───────────────────────────────────────

  const matched = (matchId: string) => ({
    status: { status: "matched", matchId } as never, modeId: "match_grid", result: "created" as const,
  });

  it("PGM2: Play on Match Grid starts the bonus game and hands it to the arena", async () => {
    h.startBonusGame.mockResolvedValue(matched("rbg_abc"));
    const router = renderPage();
    await ready();
    fireEvent.click(within(card("match_grid")).getByTestId("mode-card-play"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz/ranked"));
    expect(JSON.parse(screen.getByTestId("ranked-route").textContent!))
      .toEqual({ matchId: "rbg_abc", origin: "bonus_game" });
    const [modeId, key] = h.startBonusGame.mock.calls[0];
    expect(modeId).toBe("match_grid");
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(h.track).toHaveBeenCalledWith("more_challenges_mode_selected",
      { metadata: { game_mode_id: "match_grid", action: "play", source: "direct" } });
  });

  it("PGM2: another live match is named, with the way back to it", async () => {
    h.startBonusGame.mockRejectedValue(new RankedApiError("backend", 409, "finish it", "RANKED_ACTIVE_MATCH_EXISTS"));
    renderPage();
    await ready();
    fireEvent.click(within(card("match_grid")).getByTestId("mode-card-play"));
    expect(await screen.findByTestId("more-challenges-notice-active_match")).toHaveTextContent("Match Grid");
    expect(screen.getByTestId("more-challenges-notice-resume")).toHaveAttribute("href", "/quiz/ranked");
  });

  it("PGM2: a paused Bonus Games switch says so and starts nothing", async () => {
    h.startBonusGame.mockRejectedValue(new RankedApiError("backend", 503, "paused", "BONUS_GAMES_PAUSED"));
    const router = renderPage();
    await ready();
    fireEvent.click(within(card("match_grid")).getByTestId("mode-card-play"));
    expect(await screen.findByTestId("more-challenges-notice-paused")).toHaveTextContent("paused");
    expect(router.state.location.pathname).toBe("/quiz/more-challenges");
  });

  it("PGM2: Play Again (?play=match_grid) starts that mode once and drops the parameter", async () => {
    h.startBonusGame.mockResolvedValue(matched("rbg_again"));
    const router = renderPage(null, "?play=match_grid");
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz/ranked"));
    expect(h.startBonusGame).toHaveBeenCalledTimes(1);
    expect(JSON.parse(screen.getByTestId("ranked-route").textContent!).matchId).toBe("rbg_again");
  });

  it("PGM2: ?play= for a mode that cannot start starts nothing", async () => {
    const router = renderPage(null, "?play=rangefinder");
    await ready();
    await waitFor(() => expect(router.state.location.search).not.toContain("play="));
    expect(h.startBonusGame).not.toHaveBeenCalled();
  });

  it("PGM2: a live bonus game of another mode is named, not silently opened", async () => {
    h.startBonusGame.mockResolvedValue({
      status: { status: "matched", matchId: "rbg_live" } as never, modeId: "reconstruct", result: "resumed",
    });
    const router = renderPage();
    await ready();
    fireEvent.click(within(card("match_grid")).getByTestId("mode-card-play"));
    const notice = await screen.findByTestId("more-challenges-notice-other_game");
    expect(notice).toHaveTextContent("Your Reconstruct game is still in progress");
    expect(router.state.location.pathname).toBe("/quiz/more-challenges");
    fireEvent.click(screen.getByTestId("more-challenges-notice-return"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz/ranked"));
    expect(JSON.parse(screen.getByTestId("ranked-route").textContent!)).toEqual({ matchId: "rbg_live", origin: "bonus_game" });
  });

  // ── MC-UX1: the gallery ───────────────────────────────────────────────────

  it("MC-UX1: three collections, each with its games, and every card its own art", async () => {
    renderPage();
    await ready();
    for (const [id, title, ids] of [
      ["daily_extras", "Daily Extras", ["time_trial", "survival"]],
      ["knowledge_arena", "Knowledge Arena", ["roster_lock", "draft_memory", "chronoscope", "match_grid", "reconstruct", "order_forge"]],
      ["precision_recall", "Precision & Recall", ["rangefinder", "glyph_press", "perfect_timing", "stat_drop", "combat_estimate"]],
    ] as const) {
      fireEvent.click(screen.getByTestId(`more-challenges-tab-${id}`));
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
      expect(cards().map((c) => c.getAttribute("data-mode-id"))).toEqual(ids);
      expect(screen.getByTestId(`more-challenges-tab-${id}`)).toHaveTextContent(`${title}${ids.length}`);
      for (const c of cards()) {
        const art = within(c).getByTestId("mode-card-art");
        expect(art).toHaveAttribute("data-art", c.getAttribute("data-mode-id"));
        expect(art).toHaveAttribute("aria-hidden", "true");
      }
    }
    expect(screen.getByRole("heading", { level: 1, name: "More Challenges" })).toBeInTheDocument();
    expect(screen.getByTestId("more-challenges-hero"))
      .toHaveTextContent("Unrated: they never change your Daily score or Ranked rating.");
  });

  it("MC-UX1: no repeated OPEN chips; a playable bonus game shows Play and no badge", async () => {
    renderPage();
    await ready();
    expect(screen.queryByText(/^open$/i)).toBeNull();
    for (const id of ["match_grid", "rangefinder", "combat_estimate"]) {
      expect(card(id)).toHaveAttribute("data-state", "ready");
      expect(within(card(id)).queryByTestId("mode-card-status")).toBeNull();
      expect(within(card(id)).getByTestId("mode-card-play")).toHaveTextContent("Play");
    }
  });

  it("MC-UX1: with no Daily, the Daily stages are marked 'Daily first', not playable", async () => {
    renderPage();
    await ready();
    await waitFor(() => expect(within(card("time_trial")).getByTestId("mode-card-play")).toBeInTheDocument());
    for (const id of ["time_trial", "survival"]) {
      expect(card(id)).toHaveAttribute("data-state", "daily_first");
      expect(within(card(id)).getByTestId("mode-card-status")).toHaveTextContent("Daily first");
      expect(within(card(id)).getByTestId("mode-card-play")).toHaveTextContent("Start Today's Daily");
    }
    fireEvent.click(within(card("survival")).getByTestId("mode-card-play"));
    await waitFor(() => expect(screen.getByTestId("daily-route")).toBeInTheDocument());
    expect(JSON.parse(screen.getByTestId("daily-route").textContent!)).toEqual({ startDaily: true });
  });

  it("MC-UX1: stages played today show today's result and offer no Play", async () => {
    h.readToday.mockResolvedValue(fixtureV5Run(V5_ELIGIBLE_DAY,
      { main_completed_at: "2026-10-16T10:00:00Z", main_score: 1234, current_stage_index: 3 },
      { 0: { status: "completed", result: wireResult() }, 1: { status: "completed", result: wireResult({ correct: 11 }) },
        2: { status: "completed", result: wireResult({ correct: 7 }) } }));
    renderPage();
    await ready();
    await waitFor(() => expect(card("time_trial")).toHaveAttribute("data-state", "played"));
    expect(within(card("time_trial")).getByTestId("mode-card-done")).toHaveTextContent("Played today11 correct");
    expect(within(card("survival")).getByTestId("mode-card-done")).toHaveTextContent("Played today7 correct");
  });

  it("MC-UX1: paused bonus games say so once per collection; the Daily stages are untouched", async () => {
    const paused = JSON.parse(JSON.stringify(wire));
    for (const m of paused.modes) {
      if (m.launch && m.launch.kind !== "daily_stage") {
        m.launch = null;
        m.availability = { status: "paused", reason_code: "BONUS_PAUSED", message: "New bonus games are paused for now." };
      }
    }
    catalogBody = paused;
    renderPage();
    await ready();
    for (const id of ["match_grid", "rangefinder"]) {
      expect(card(id)).toHaveAttribute("data-state", "paused");
      expect(screen.getByTestId(`more-challenges-paused-${COLLECTION[id]}`))
        .toHaveTextContent("New bonus games are paused for now.");
      expect(within(card(id)).getByTestId("mode-card-blocked")).toHaveTextContent(/^Paused$/);
    }
    expect(screen.getByTestId("more-challenges-count")).toHaveTextContent("0 ready to play now");
  });

  // ── MC-UX2: category navigation ───────────────────────────────────────────

  it("MC-UX2: one collection at a time; arrows step through and wrap; the URL remembers", async () => {
    const router = renderPage();
    await ready();
    expect(panel()).toHaveAttribute("data-collection", "knowledge_arena");
    expect(screen.getByTestId("more-challenges-tab-knowledge_arena")).toHaveAttribute("aria-selected", "true");
    expect(cards()).toHaveLength(6);
    fireEvent.click(screen.getByTestId("more-challenges-next"));
    expect(panel()).toHaveAttribute("data-collection", "precision_recall");
    expect(cards()).toHaveLength(5);
    expect(router.state.location.search).toContain("c=precision_recall");
    fireEvent.click(screen.getByTestId("more-challenges-next"));
    expect(panel()).toHaveAttribute("data-collection", "daily_extras");
    fireEvent.click(screen.getByTestId("more-challenges-prev"));
    expect(panel()).toHaveAttribute("data-collection", "precision_recall");
    expect(screen.getByTestId("more-challenges-prev"))
      .toHaveAccessibleName("Previous collection: Knowledge Arena");
    // The panel is the selected tab's.
    expect(panel()).toHaveAttribute("role", "tabpanel");
    expect(panel()).toHaveAttribute("aria-labelledby", "mc-tab-precision_recall");
  });

  it("MC-UX2: keyboard — Left/Right/Home/End move the selected tab and its focus", async () => {
    renderPage();
    await ready();
    const tab = (id: string) => screen.getByTestId(`more-challenges-tab-${id}`);
    tab("knowledge_arena").focus();
    fireEvent.keyDown(tab("knowledge_arena"), { key: "ArrowRight" });
    expect(panel()).toHaveAttribute("data-collection", "precision_recall");
    expect(tab("precision_recall")).toHaveFocus();
    fireEvent.keyDown(tab("precision_recall"), { key: "Home" });
    expect(panel()).toHaveAttribute("data-collection", "daily_extras");
    fireEvent.keyDown(tab("daily_extras"), { key: "ArrowLeft" });
    expect(panel()).toHaveAttribute("data-collection", "precision_recall");
    expect(tab("precision_recall")).toHaveAttribute("tabindex", "0");
    expect(tab("daily_extras")).toHaveAttribute("tabindex", "-1");
  });

  it("MC-UX2: ?c= opens that collection, and the page's Next button moves on", async () => {
    renderPage(null, "?c=precision_recall");
    await ready();
    expect(panel()).toHaveAttribute("data-collection", "precision_recall");
    expect(screen.getByTestId("more-challenges-next-page")).toHaveTextContent("Next: Daily Extras");
    fireEvent.click(screen.getByTestId("more-challenges-next-page"));
    expect(panel()).toHaveAttribute("data-collection", "daily_extras");
  });

  // ── MC-UX2: Random ────────────────────────────────────────────────────────

  it("MC-UX2: Random launches a playable game through the same start contract and analytics", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    h.startBonusGame.mockResolvedValue(matched("rbg_rand"));
    const router = renderPage(null, "?c=precision_recall");
    await ready();
    await waitFor(() => expect(screen.getByTestId("more-challenges-random")).toBeEnabled());
    // No Daily yet: the Daily stages are not candidates; the first playable is Roster Lock.
    fireEvent.click(screen.getByTestId("more-challenges-random"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz/ranked"));
    expect(h.startBonusGame.mock.calls[0][0]).toBe("roster_lock");
    expect(h.track).toHaveBeenCalledWith("more_challenges_mode_selected",
      { metadata: { game_mode_id: "roster_lock", action: "play", source: "direct" } });
  });

  it("MC-UX2: Random into a session game opens its own page; into the live Daily stage continues the run", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    let router = renderPage();
    await ready();
    await waitFor(() => expect(screen.getByTestId("more-challenges-random")).toBeEnabled());
    fireEvent.click(screen.getByTestId("more-challenges-random"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz/more-challenges/combat_estimate"));
    document.body.innerHTML = "";
    vi.spyOn(Math, "random").mockReturnValue(0);
    h.readToday.mockResolvedValue(mainDone());
    router = renderPage();
    await ready();
    await waitFor(() => expect(within(card("time_trial")).getByTestId("mode-card-play")).toHaveTextContent("Play"));
    fireEvent.click(screen.getByTestId("more-challenges-random"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/quiz/daily-challenge"));
    expect(JSON.parse(screen.getByTestId("daily-route").textContent!)).toEqual({ continueDaily: true });
  });

  it("MC-UX2: with nothing playable, Random is disabled and says so", async () => {
    const paused = JSON.parse(JSON.stringify(wire));
    for (const m of paused.modes) {
      if (m.launch && m.launch.kind !== "daily_stage") {
        m.launch = null;
        m.availability = { status: "paused", reason_code: "BONUS_PAUSED", message: "Paused." };
      }
    }
    catalogBody = paused;
    renderPage();
    await ready();
    await waitFor(() => expect(within(card("time_trial")).getByTestId("mode-card-play")).toBeInTheDocument());
    expect(screen.getByTestId("more-challenges-random")).toBeDisabled();
    expect(screen.getByTestId("more-challenges-random-note")).toHaveTextContent("No game is playable right now.");
  });

  // ── MC-UX2: the player's own record ───────────────────────────────────────

  it("MC-UX2: no session — no stats request, an honest empty record, 'No games yet' on cards", async () => {
    renderPage();
    await ready();
    expect(await screen.findByTestId("more-challenges-stats")).toHaveAttribute("data-state", "empty");
    expect(screen.getByTestId("more-challenges-stats")).toHaveTextContent("Your record starts with your first game.");
    expect(h.fetch.mock.calls.some(([u]) => String(u).endsWith("/me/summary"))).toBe(false);
    expect(h.ensure).not.toHaveBeenCalled();
    expect(within(card("match_grid")).getByTestId("mode-card-history")).toHaveTextContent("No games yet");
  });

  it("MC-UX2: a returning player sees their stats and each game's own record", async () => {
    h.token.mockResolvedValue("tok");
    renderPage();
    await ready();
    const stats = await screen.findByTestId("more-challenges-stats");
    await waitFor(() => expect(stats).toHaveAttribute("data-state", "ready"));
    expect(screen.getByTestId("mc-stat-played")).toHaveTextContent(String(summaryWire.overall.games_played));
    expect(screen.getByTestId("mc-stat-favorite")).toHaveTextContent("Combat Estimate");
    expect(screen.getByTestId("mc-stat-week")).toHaveTextContent(`${summaryWire.overall.games_this_week} games`);
    expect(screen.getByTestId("mc-stat-last")).toHaveTextContent("Glyph Press");
    expect(within(card("match_grid")).getByTestId("mode-card-history")).toHaveTextContent("Played 2 · Best 3/3 boards");
    expect(within(card("roster_lock")).getByTestId("mode-card-history")).toHaveTextContent("No games yet");
    expect(within(card("time_trial")).getByTestId("mode-card-history")).toHaveTextContent("Played 3 · Best 17 correct");
    expect(within(card("perfect_timing")).getByTestId("mode-card-history")).toHaveTextContent("1 run · Closest 0.18s off");
    expect(h.ensure).not.toHaveBeenCalled();
  });

  it("MC-UX2: a first-time player with a session reads the same honest empty record", async () => {
    h.token.mockResolvedValue("tok");
    summary = () => ok(emptySummaryWire);
    renderPage();
    await ready();
    await waitFor(() => expect(screen.getByTestId("more-challenges-stats")).toHaveAttribute("data-state", "empty"));
    expect(within(card("rangefinder")).getByTestId("mode-card-history")).toHaveTextContent("No games yet");
  });

  it("MC-UX2: stats that fail to load never block play; cards drop the history line", async () => {
    h.token.mockResolvedValue("tok");
    summary = () => ok({}, 500);
    renderPage();
    await ready();
    await waitFor(() => expect(screen.getByTestId("more-challenges-stats")).toHaveAttribute("data-state", "error"),
      { timeout: 4000 });
    expect(within(card("match_grid")).queryByTestId("mode-card-history")).toBeNull();
    expect(within(card("match_grid")).getByTestId("mode-card-play")).toBeEnabled();
  });

  // ── MC-UX2: Reconstruct shows a real recipe ───────────────────────────────

  it("MC-UX2: Reconstruct's preview is Spear of Shojin and its three components", async () => {
    renderPage();
    await ready();
    const art = within(card("reconstruct")).getByTestId("mode-card-art");
    const srcs = [...art.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "");
    for (const id of [3161, 1037, 1028, 2021]) expect(srcs.some((s) => s.endsWith(`/assets/items/${id}.png`))).toBe(true);
  });
});
