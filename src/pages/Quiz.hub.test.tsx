/**
 * Leaguecraft hub (/quiz) — the Ranked-first one-page composition.
 *
 * Hierarchy under test: compact Leaguecraft header → the dominant Ranked hero
 * (with the absorbed progress strip) → one short secondary row of Recent
 * Studies and a demoted Practice panel, with Mastery as a link inside it. The modes withheld from this page (Time Trial / Daily, Stat
 * Check, Knowledge Breakdown, Achievements) must be absent from the hub while
 * their routes stay live elsewhere — see HUB_MODULES in Quiz.tsx.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/ads/AdSlot", () => ({ default: () => null }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", is_anonymous: false } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInAnonymously: vi.fn() },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
      // PLAY1: `useAppSettings` reads the whole app_settings table with a
      // bare `.select(...).then(...)` to resolve global platform policy. No
      // rows -> the fail-safe defaults, which is all three PLAY entries
      // visible.
      then: (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data: [] }),
      }),
    }),
  },
}));
vi.mock("@/lib/quiz/onboarding-gate", () => ({
  hasVisitedHub: () => true,
  incrementAnonymousActions: () => 0,
  getAnonymousActionCount: () => 0,
  hasSoftNudgeBeenSeen: () => true,
  markSoftNudgeSeen: () => {},
}));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: async () => "test-token",
}));

// Mirrors the shape the backend actually serves at /api/quiz/sets, including
// the catalog-wide set the "Practice Questions" primary action opens.
const SETS = [
  { id: 5, name: "All Current Questions", description: "Everything", question_count: 1260 },
  { id: 2, name: "Item Knowledge", description: "Recipes", question_count: 606 },
  { id: 3, name: "Champion Basics", description: "Kits", question_count: 522 },
];

const HISTORY = {
  ok: true,
  is_pro: false,
  total_count: 12,
  limited: false,
  free_limit: 10,
  upsell_message: null,
  results: [
    { session_id: 3, date: "2026-07-16", completed_at: "2026-07-16 10:00:00", mode: "standard", category: "Item Knowledge", score: 8, total_questions: 10, accuracy: 80 },
    { session_id: 2, date: "2026-07-15", completed_at: "2026-07-15 09:00:00", mode: "daily", category: null, score: 3, total_questions: 5, accuracy: 60 },
    { session_id: 1, date: "2026-07-14", completed_at: "2026-07-14 08:00:00", mode: "standard", category: "Champion Basics", score: 2, total_questions: 10, accuracy: 20 },
  ],
};

const questionsMock = vi.fn(async () => ({ questions: [] }));
const categoryQuestionsMock = vi.fn(async (_category?: unknown, _limit?: unknown) => ({
  questions: [] as unknown[],
}));
const historyMock = vi.fn(async () => HISTORY);
vi.mock("@/lib/quiz/api", () => ({
  quizApi: {
    sets: async () => ({ sets: SETS }),
    questions: (...args: unknown[]) => questionsMock(...(args as [])),
    categoryQuestions: (...args: unknown[]) => categoryQuestionsMock(...(args as [])),
    getProgress: async () => ({
      rank_name: "Bronze",
      attempts: 2,
      current_streak: 3,
      best_streak: 7,
      accuracy: 71.2,
    }),
    getCategories: async () => ({ categories: [] }),
    getAchievements: async () => ({ achievements: [] }),
    getHistory: () => historyMock(),
    startSession: async () => ({ ok: false }),
    completeSession: async () => ({}),
  },
  resolveQuizAssetUrl: (p?: string) => (p ? `http://assets.local/${p}` : undefined),
  progressAttempts: (p: { attempts?: number } | null) => p?.attempts ?? 0,
}));

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

async function renderHub() {
  const utils = render(
    <MemoryRouter initialEntries={["/quiz"]}>
      <QuizPage />
      <LocationProbe />
    </MemoryRouter>,
  );
  // Wait on the Leaguecraft Record, not on a set name: category names such as
  // "Item Knowledge" legitimately appear in the history rows too. The practice
  // tiles used to be this signal; the panel that held them is withheld now
  // (HUB_MODULES.practicePanel), so the record is the stable landmark.
  await waitFor(() =>
    expect(utils.container.querySelector('[data-testid="leaguecraft-workspace"]')).not.toBeNull(),
  );
  return utils;
}

import QuizPage from "./Quiz";

beforeEach(() => {
  questionsMock.mockClear();
  historyMock.mockClear();
  historyMock.mockResolvedValue(HISTORY);
  // Optional-call: in this repo's vitest/jsdom environment `localStorage`
  // is a bare object with no Storage methods, and an unguarded call throws
  // in `beforeEach` — which silently errored out every test in this file
  // before the redesign. Guarding here keeps the reset when the environment
  // provides one, without touching the shared setup other suites rely on.
  localStorage.clear?.();
});
afterEach(cleanup);

describe("Leaguecraft hub — top chrome", () => {
  // The lobby has NO utility/header row of its own. It used to, and the row
  // cost the three parchment columns the strip directly under the shell's HUD
  // band — the space the scroll caps want. Every control on it was decorative
  // or reachable elsewhere, so the whole row is gone from this phase rather
  // than shrunk. These assertions are the guard against it creeping back.
  it("renders no header row above the lobby", async () => {
    const { container } = await renderHub();
    expect(container.querySelector("header")).toBeNull();
  });

  it("drops the decorative tagline from the lobby", async () => {
    await renderHub();
    expect(screen.queryByText("Study. Practice. Ascend.")).toBeNull();
  });

  it("leaves the /lol escape to the shell's own home control, not a second inline pill", async () => {
    // LEAGUE_ONLY_MODE points GlobalHud's always-present top-left home control
    // at /lol (see GlobalHud.test.tsx), so an inline "League Hub" link here was
    // a duplicate of it that cost a whole row of document flow.
    await renderHub();
    expect(screen.queryByLabelText("Back to League hub")).toBeNull();
  });

  it("keeps exactly one h1 — the centre scroll's wordmark", async () => {
    const { container } = await renderHub();
    const h1s = [...container.querySelectorAll("h1")];
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toContain("LEAGUECRAFT");
  });

  // MALT top-band pass. The HUD reserves a full-width `--app-header-h` strip
  // but paints only two corner clusters, so from `lg` the hub cancels the
  // shell's padding and the rack rises into the empty middle. The two steps
  // are not interchangeable: at `lg` the parchment's own top roll is too short
  // to keep the column headings clear of the corner controls (5px measured at
  // 1024), so that breakpoint keeps 1.5rem back and only `xl` reclaims it all.
  it("reclaims the HUD band from lg, in two measured steps", async () => {
    const { container } = await renderHub();
    const wrapper = container.querySelector('[data-testid="hub-ranked-section"]')
      ?.closest("div.max-w-\\[1500px\\]") as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper!.className).toContain("lg:-mt-[calc(var(--app-header-h)_-_1.5rem)]");
    expect(wrapper!.className).toContain("xl:-mt-[var(--app-header-h)]");
    // Below lg the columns stack full-width and the first one WOULD run under
    // both controls, so the band must stay whole there — no unprefixed -mt.
    expect(wrapper!.className).not.toMatch(/(^|\s)-mt-/);
  });

  it("demotes the tutorial entry below the lobby without removing it", async () => {
    // /quiz/tutorial has no other UI entry point, and the platform-policy copy
    // promises it stays available, so this link may be MOVED but never deleted.
    const { container } = await renderHub();
    const link = screen.getByTestId("replay-tutorial-link");
    expect(link.getAttribute("href")).toBe("/quiz/tutorial");

    const utility = container.querySelector('[data-testid="hub-utility-line"]')!;
    expect(utility).not.toBeNull();
    expect(utility.contains(link)).toBe(true);

    // Below the composition, in DOM (= tab) order.
    const ranked = container.querySelector('[data-testid="hub-ranked-section"]')!;
    expect(
      ranked.compareDocumentPosition(utility) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("Leaguecraft hub — hierarchy", () => {
  // The consolidation pass: the lobby reads Ranked → rail → ONE record.
  it("orders Ranked hero → category rail → the Leaguecraft Record, and nothing between", async () => {
    const { container } = await renderHub();
    const ranked = container.querySelector('[data-testid="hub-ranked-section"]')!;
    const rail = container.querySelector('[data-testid="quiz-category-rail"]')!;
    const record = container.querySelector('[data-testid="hub-record-section"]')!;
    for (const el of [ranked, rail, record]) expect(el).not.toBeNull();
    const follows = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(ranked, rail)).toBeTruthy();
    expect(follows(rail, record)).toBeTruthy();
    expect(ranked.querySelector('[data-testid="ranked-hero"]')).not.toBeNull();
    // Mastery has never had a band of its own and still does not: it is one
    // quiet link, now in the lobby's utility line rather than inside the
    // withheld Practice panel — /quiz is the only entrance to the route.
    expect(container.querySelector('[data-testid="hub-mastery-section"]')).toBeNull();
    const utility = container.querySelector('[data-testid="hub-utility-line"]')!;
    expect(utility.querySelector('[data-testid="hub-mastery-link"]')).not.toBeNull();
  });

  it("no longer renders a standalone Recent Studies module", async () => {
    // It was a three-row preview of the payload the record's History ledger
    // prints in full. Two renderings of one record is the duplication this
    // pass removed — so there is no second preview, no second heading and no
    // second "view full history" action anywhere on the page.
    const { container } = await renderHub();
    expect(container.querySelector('[data-testid="hub-recent-section"]')).toBeNull();
    expect(container.querySelector('[data-testid="recent-results-card"]')).toBeNull();
    expect(container.querySelector('[data-testid="history-row"]')).toBeNull();
    expect(screen.queryByText("Recent Studies")).toBeNull();
    expect(screen.queryByText(/View full history/)).toBeNull();
    // …and the record itself is present exactly once.
    expect(container.querySelectorAll('[data-testid="leaguecraft-workspace"]').length).toBe(1);
  });

  it("withholds the Practice for Ranked panel without touching practice itself", async () => {
    // The category rail above is becoming the practice selector; until it
    // opens, the panel was a second navigation to the same six subjects.
    const { container } = await renderHub();
    expect(container.querySelector('[data-testid="hub-practice-section"]')).toBeNull();
    expect(container.querySelector('[data-testid="practice-tiles"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="practice-tile"]').length).toBe(0);
    expect(container.querySelector('[data-testid="practice-primary-cta"]')).toBeNull();
    expect(screen.queryByText("Practice for Ranked")).toBeNull();
    // Hidden because the rail INHERITED the job, not because practice went
    // away: the panel's second navigation is gone and the rail is now the one
    // Practice chooser on the page.
    const rail = container.querySelector('[data-testid="quiz-category-rail"]')!;
    expect(rail.querySelectorAll("a").length).toBe(0);
    expect(rail.querySelectorAll("button").length).toBe(6);
  });

  it("makes the rail the Practice chooser — a tile starts a session in place", async () => {
    // PRAC1. The rail is the chooser: no intermediate route, no second
    // practice system. Pressing a subject runs the same `/quiz` runner the
    // sets always used, fed from that subject's live question categories.
    categoryQuestionsMock.mockClear();
    const { container } = await renderHub();
    const tile = container.querySelector(
      '[data-testid="quiz-category-rail-tile"][data-category="itemization"]',
    )!;
    fireEvent.click(within(tile as HTMLElement).getByRole("button"));

    await waitFor(() => expect(categoryQuestionsMock).toHaveBeenCalled());
    // It asked the ITEM categories, and it never left /quiz.
    const asked = categoryQuestionsMock.mock.calls.map((call) => call[0]);
    expect(asked.length).toBeGreaterThan(1);
    asked.forEach((name) => expect(String(name)).toMatch(/^Item /));
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
  });

  it("Vision navigates nowhere and starts nothing", async () => {
    categoryQuestionsMock.mockClear();
    const { container } = await renderHub();
    const tile = container.querySelector(
      '[data-testid="quiz-category-rail-tile"][data-category="vision"]',
    )!;
    expect(tile.getAttribute("data-available")).toBe("false");
    fireEvent.click(within(tile as HTMLElement).getByRole("button"));
    expect(categoryQuestionsMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
    // The lobby is still the lobby — no runner took over the page.
    expect(container.querySelector('[data-testid="quiz-category-rail"]')).not.toBeNull();
  });

  it("the Ranked hero keeps the personal records ledger + profile link", async () => {
    const { container } = await renderHub();
    const hero = container.querySelector('[data-testid="ranked-hero"]')!;
    // MALT: the four rounded stat tiles are now ruled ledger lines on the
    // Academy sheet. Same real figures, parchment-native treatment.
    const strip = hero.querySelector('[data-testid="hero-personal-records"]')!;
    expect(strip.textContent).toContain("Current streak");
    expect(strip.textContent).toContain("Best streak");
    expect(strip.textContent).toContain("71%"); // rounded accuracy
    expect(strip.textContent).not.toContain("71.2");
    expect(strip.textContent).toContain("Questions answered");
    expect(hero.querySelector('a[href="/profile"]')?.textContent).toMatch(/View full profile/);
  });

  it("shows placement as a compact state inside the Ranked block, not a screen", async () => {
    const { container } = await renderHub();
    // The pre-placement state names the ladder's FLOOR rather than exclusion
    // from it: Bronze is the lowest of the five tiers. It is still not a tier
    // CLAIM — the emblem carries `data-baseline`, and no rating is shown.
    expect(screen.getByRole("heading", { name: "Bronze" })).toBeTruthy();
    expect(screen.queryByText("Unranked")).toBeNull();
    expect(screen.getByTestId("hub-ranked-placement").textContent).toContain("Placement 2 / 5");
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    // MALT removed the permanent placement furniture: no "Placement Series"
    // headline, no Bronze pill, no explanatory paragraph, and no popup.
    expect(container.textContent).not.toContain("Placement Series");
    expect(container.textContent).not.toContain("Complete your placement matches");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByRole("button", { name: /^Play$/ })).toBeTruthy();
  });

  /**
   * PLAY1: PLAY opens the match-entry record ON the lobby. It does NOT
   * navigate — the lobby stays mounted behind the record, and `/quiz/ranked`
   * is only reached once the server actually has a match.
   */
  it("the Ranked CTA opens the match-entry record without leaving the lobby", async () => {
    await renderHub();
    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    await waitFor(() => expect(screen.getByTestId("play-scroll")).toBeTruthy());
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
    // The lobby is still there, behind the record.
    expect(screen.getByTestId("hub-ranked-section")).toBeTruthy();
  });
});

describe("Leaguecraft hub — category rail", () => {
  // The six subjects used to be a strip inside the Practice panel: five of
  // twelve columns wide, folded to two rows of three, and below the fold on
  // every desktop. They are now a rail of their own, spanning the whole
  // composition between the rack and the workspace. These assertions guard
  // the promotion — that the rail exists, that it is a sibling of the two
  // sections rather than a child of either, and that the old strip did not
  // survive alongside it as a second copy.
  it("mounts the rail with all six subjects", async () => {
    const { container } = await renderHub();
    expect(container.querySelector('[data-testid="quiz-category-rail"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="quiz-category-rail-tile"]').length).toBe(6);
  });

  it("is the page's only copy of the six subjects", async () => {
    // The strip that used to head the Practice panel is gone, and so is the
    // panel — the rail is the single surface carrying the categories.
    const { container } = await renderHub();
    expect(container.querySelector('[data-testid="quiz-category-strip"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid="quiz-category-rail"]').length).toBe(1);
  });

  it("sits between the lobby and the workspace, at the composition's full width", async () => {
    const { container } = await renderHub();
    const rail = container.querySelector('[data-testid="quiz-category-rail"]')!;
    const lobby = container.querySelector('[data-testid="hub-ranked-section"]')!;
    // The workspace below the rail IS the Leaguecraft Record now.
    const workspace = container.querySelector('[data-testid="hub-record-section"]')!;
    // DOM order IS reading order and tab order: lobby → rail → workspace.
    expect(lobby.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rail.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A sibling of both, not nested inside either — nesting is what buried it.
    expect(lobby.contains(rail)).toBe(false);
    expect(workspace.contains(rail)).toBe(false);
  });

  it("is a menu of six in-page controls, and links to nowhere", async () => {
    // PRAC1 inverted the old assertion here: the rail was an overview until
    // the bank could open a subject, and it can. What must NOT change is that
    // it stays IN PAGE — six buttons that run the local Practice runner, and
    // no anchor that would take the player off the lobby to reach practice.
    const { container } = await renderHub();
    const rail = container.querySelector('[data-testid="quiz-category-rail"]')!;
    expect(rail.querySelectorAll("button").length).toBe(6);
    expect(rail.querySelectorAll("a, [role='button']").length).toBe(0);
    // Five doors, one declared-unavailable subject. No tile is silently inert.
    expect(rail.querySelectorAll('[data-available="true"]').length).toBe(5);
    expect(rail.querySelectorAll('[data-available="false"]').length).toBe(1);
  });

  // The rack and the rail are ONE first screen, and the workspace begins
  // after it. Before this wrapper existed the workspace's own heading crested
  // into the first viewport — enough to read as "the page carries on here"
  // and pull the eye off the composition. These are the two properties that
  // make the screen end where it is supposed to.
  it("shares one first-screen wrapper with the rack, and closes it", async () => {
    const { container } = await renderHub();
    const rail = container.querySelector('[data-testid="quiz-category-rail"]')!;
    const lobby = container.querySelector('[data-testid="hub-ranked-section"]')!;
    // The workspace below the rail IS the Leaguecraft Record now.
    const workspace = container.querySelector('[data-testid="hub-record-section"]')!;
    const firstScreen = lobby.parentElement!;
    // Rack and rail together, workspace outside — the wrapper is what holds
    // the fold, so the workspace must not be inside it.
    expect(firstScreen.contains(rail)).toBe(true);
    expect(firstScreen.contains(workspace)).toBe(false);
    // The rail is the LAST thing in it: the screen closes on the rail.
    expect(firstScreen.lastElementChild!.contains(rail)).toBe(true);
  });

  // The reserve that holds the first screen together is HEIGHT-AWARE now.
  // A flat 100dvh reserve is right on a short desktop and wrong on a tall
  // one, where the rack and rail reach only ~820px and everything above that
  // became empty classroom (268px measured at 1920x1080) purely to keep the
  // record out of sight. Below 880px tall it still applies; above it the
  // record follows the rail at a fixed distance instead.
  it("reserves the first screen on SHORT desktops only", async () => {
    const { container } = await renderHub();
    const firstScreen = container.querySelector('[data-testid="hub-ranked-section"]')!.parentElement!;
    // Only from lg: below it the rack is stacked and several viewports tall,
    // where a min-height would mean nothing and a fold does not exist.
    expect(firstScreen.className).toContain(
      "lg:[@media(max-height:879px)]:min-h-[calc(100dvh_-_2.25rem)]",
    );
    expect(firstScreen.className).toContain(
      "xl:[@media(max-height:879px)]:min-h-[calc(100dvh_-_0.75rem)]",
    );
    // Never unconditional: an unprefixed min-h would reserve the band at
    // every height and bring the dead desert back.
    expect(firstScreen.className).not.toMatch(/(^|\s)min-h-/);
    // The seam inside it is TIGHTER than the gap to the workspace outside it
    // (the root's gap-3), which is what makes rack+rail read as one thing.
    expect(firstScreen.className).toContain("gap-2");
  });

  it("gives the record its own breathing room exactly where the reserve stops", async () => {
    // Without the reserve the record would sit 12px under the rail — too
    // tight to read as its own section. The extra margin is bound to the SAME
    // height query, so the two can never disagree about which regime is on.
    const { container } = await renderHub();
    const record = container.querySelector('[data-testid="hub-record-section"]')!;
    expect(record.className).toContain("[@media(min-height:880px)]:mt-6");
    expect(record.className).not.toMatch(/(^|\s)mt-/);
  });
});

describe("Leaguecraft hub — the Leaguecraft Record", () => {
  it("is the ONE study record: the full ledger, on the page, from real data", async () => {
    const { container } = await renderHub();
    expect(screen.getByRole("heading", { name: /Leaguecraft Record/i })).toBeTruthy();
    await waitFor(() =>
      expect(container.querySelectorAll('[data-testid="study-history-row"]').length).toBe(
        HISTORY.results.length,
      ),
    );
    const rows = container.querySelectorAll('[data-testid="study-history-row"]');
    expect(rows[0].textContent).toContain("Item Knowledge");
    expect(rows[0].textContent).toContain("8/10");
    expect(rows[0].textContent).toContain("80%");
    // "Daily", never the withheld module's full name; a legacy row falls back
    // to the neutral label rather than inventing a category.
    expect(rows[1].textContent).toContain("Daily");
    expect(rows[2].textContent).toContain("Champion Basics");
    // Every row is printed once — there is no preview of the same payload
    // above it any more.
    expect(container.querySelectorAll('[data-testid="history-row"]').length).toBe(0);
    // The summary the Recent Studies card carried, folded into one line.
    const scope = screen.getByTestId("study-history-scope").textContent!;
    expect(scope).toContain("12");
    expect(scope).toMatch(/average/);
    expect(scope).toMatch(/best/);
  });

  it("owns the ONLY empty-history CTA, and it opens PRACTICE not Ranked", async () => {
    // The record is practice-shaped: a Ranked duel writes no row into this
    // stream, so the empty state must not send the reader to the one activity
    // whose result could never fill it. It starts the primary set in place —
    // not a route change — and it is the page's only empty state.
    historyMock.mockResolvedValue({ ...HISTORY, results: [], total_count: 0 });
    const { container } = await renderHub();
    await waitFor(() =>
      expect(container.querySelector('[data-testid="study-history-empty"]')).not.toBeNull(),
    );
    expect(container.querySelectorAll('[data-testid="study-history-empty"]').length).toBe(1);
    expect(container.querySelector('[data-testid="history-empty"]')).toBeNull();
    const empty = container.querySelector('[data-testid="study-history-empty"]') as HTMLElement;
    expect(within(empty).queryByRole("button", { name: /Ranked/i })).toBeNull();
    fireEvent.click(within(empty).getByRole("button", { name: /Start practising/ }));
    await waitFor(() =>
      expect(questionsMock).toHaveBeenCalledWith("All Current Questions", 10),
    );
    await waitFor(() =>
      expect(container.querySelector('[data-testid="hub-ranked-section"]')).toBeNull(),
    );
    // Still on /quiz — practice is a phase of this page, never a navigation.
    expect(screen.getByTestId("location").textContent).toBe("/quiz");
  });

  it("keeps Review as the second pane, reachable from the record", async () => {
    const { container } = await renderHub();
    fireEvent.click(screen.getByTestId("workspace-tab-review"));
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="leaguecraft-workspace"]')!.getAttribute("data-mode"),
      ).toBe("review"),
    );
    expect(container.querySelector('[data-testid="workspace-panel-review"]')).not.toBeNull();
  });
});

describe("Leaguecraft hub — Mastery", () => {
  // /quiz is the ONLY entrance to /quiz/mastery in the product, so hiding the
  // Practice panel that used to contain this link had to relocate it, not
  // withhold it with the panel. It is still one quiet line — in the lobby's
  // utility row now, beside the tutorial entry.
  it("keeps Mastery as one quiet link that still reaches the journeys", async () => {
    const { container } = await renderHub();
    const link = screen.getByTestId("hub-mastery-link");
    expect(link.getAttribute("href")).toBe("/quiz/mastery");
    expect(container.querySelector('[data-testid="hub-utility-line"]')!.contains(link)).toBe(true);
    // One entrance, not two.
    expect(container.querySelectorAll('[data-testid="hub-mastery-link"]').length).toBe(1);
  });
});

describe("Leaguecraft hub — modes withheld from this page", () => {
  it("does not surface Time Trial, Daily, Stat Check, Knowledge Breakdown or Achievements", async () => {
    const { container } = await renderHub();
    expect(container.querySelector('[data-testid="hub-score-attack-card"]')).toBeNull();
    expect(screen.queryByText("Daily Challenge")).toBeNull();
    expect(container.querySelector('[data-testid="hub-stat-check-link"]')).toBeNull();
    expect(screen.queryByText("Knowledge Breakdown")).toBeNull();
    expect(screen.queryByText("Achievements")).toBeNull();
    // …and the page is not simply empty in their place: the Ranked-first loop
    // is fully present.
    expect(container.querySelector('[data-testid="ranked-hero"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="quiz-category-rail"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="hub-record-section"]')).not.toBeNull();
  });

  it("keeps the diagnostics entry available for testing", async () => {
    await renderHub();
    expect(
      screen.getByRole("link", { name: /Diagnostics/ }).getAttribute("href"),
    ).toBe("/quiz/diagnostics");
  });
});
