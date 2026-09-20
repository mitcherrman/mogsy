/**
 * MRLVL1 Phase 3 — the frozen champion level in standalone League Swipe.
 *
 * Standalone Meta Reflex and Ranked Meta Reflex share no card component: two
 * state models, two geometries, two sets of testids. They DO share this one
 * fact and this one badge, and that is what is pinned here — the same
 * `ChampionLevelBadge`, driven by the same server field, reaching the screen
 * through this page's own wiring.
 *
 * The level enters as a property of the POOL, because it is a property of the
 * category the backend was asked for. The page never picks it, and there is no
 * request shape through which it could.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LeagueSwipeGame from "./LeagueSwipeGame";
import type { FactualPool } from "@/lib/league-swipe/api";

/** The approved Meta Reflex breakpoint pool, verbatim. */
const LEVELS = [1, 6, 11, 16, 18, 20] as const;

/**
 * An HP pool at one level, shaped like the MRLVL1 backend serves it: the
 * level-aware prompt (no "base"), values measured AT that level, and the level
 * itself as structured state beside them.
 */
function hpPoolAt(level: number | null): FactualPool {
  return {
    categoryId: level == null ? "champion-hp-duel" : `champion-hp-lvl${level}-duel`,
    prompt: level == null
      ? "Which champion has more base health?"
      : "Which champion has more Health?",
    unit: " HP",
    higherWins: true,
    championLevel: level,
    entities: [
      { id: "Sion", label: "Sion", value: 720, asset_path: null },
      { id: "Ahri", label: "Ahri", value: 590, asset_path: null },
    ],
  };
}

/** Move speed: League does not scale it, so the backend sends null forever. */
const MOVE_SPEED_POOL: FactualPool = {
  categoryId: "champion-move-speed-duel",
  prompt: "Which champion is faster?",
  unit: " MS",
  higherWins: true,
  championLevel: null,
  entities: [
    { id: "Master Yi", label: "Master Yi", value: 355, asset_path: null },
    { id: "Ahri", label: "Ahri", value: 330, asset_path: null },
  ],
};

const mocks = vi.hoisted(() => ({
  fetchFactualPool: vi.fn(),
  fetchChampionStats: vi.fn(),
  fetchItems: vi.fn(),
  fetchChampionNames: vi.fn(),
  recordSwipeResult: vi.fn(),
  verifyFactualChoice: vi.fn(),
}));

vi.mock("@/lib/league-swipe/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
    "@/lib/league-swipe/api",
  );
  return {
    ...actual,
    // makeFactualMatchup stays REAL: if the builder stopped carrying the
    // pool's level onto the matchup, these tests must fail.
    fetchChampionNames: mocks.fetchChampionNames,
    fetchChampionStats: mocks.fetchChampionStats,
    fetchItems: mocks.fetchItems,
    fetchFactualPool: mocks.fetchFactualPool,
    recordSwipeResult: mocks.recordSwipeResult,
    verifyFactualChoice: mocks.verifyFactualChoice,
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: null }),
  getChampionLoading: () => null,
}));
vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInAnonymously: vi.fn(async () => ({ data: {}, error: null })) } },
}));

function renderGame(slug: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/league-swipe/${slug}`]}>
        <Routes>
          <Route path="/league-swipe/:gameSlug" element={<LeagueSwipeGame />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchChampionNames.mockResolvedValue([]);
  mocks.fetchChampionStats.mockResolvedValue([]);
  mocks.fetchItems.mockResolvedValue([]);
  mocks.recordSwipeResult.mockResolvedValue(null);
  mocks.verifyFactualChoice.mockResolvedValue(null);
});
afterEach(cleanup);

describe("standalone League Swipe — the level badge", () => {
  it.each(LEVELS)("shows LVL %i when the pool is frozen at it", async (level) => {
    mocks.fetchFactualPool.mockResolvedValue(hpPoolAt(level));
    renderGame("base-hp-duel");
    await waitFor(() => {
      expect(screen.getByTestId("champion-level-badge"))
        .toHaveTextContent(`LVL ${level}`);
    });
  });

  it("shows the level-aware prompt without the level in the sentence", async () => {
    mocks.fetchFactualPool.mockResolvedValue(hpPoolAt(16));
    renderGame("base-hp-duel");
    // The heading shows the STATIC config prompt until the pool resolves, so
    // wait for the backend's own wording to replace it — that swap is the
    // thing being asserted.
    const heading = await screen.findByRole("heading", { level: 1 });
    await waitFor(() =>
      expect(heading).toHaveTextContent("Which champion has more Health?"));
    expect(heading.textContent).not.toMatch(/level|lvl|\b16\b/i);
  });

  it("puts the badge above the prompt, not on either answer card", async () => {
    mocks.fetchFactualPool.mockResolvedValue(hpPoolAt(11));
    renderGame("base-hp-duel");
    const badge = await screen.findByTestId("champion-level-badge");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(badge.parentElement).toContainElement(heading);
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toContainElement(badge);
    }
  });

  it("shows no badge for a level-independent pool", async () => {
    mocks.fetchFactualPool.mockResolvedValue(MOVE_SPEED_POOL);
    renderGame("base-hp-duel");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() =>
      expect(screen.getByText("Which champion is faster?")).toBeInTheDocument());
    expect(screen.queryByTestId("champion-level-badge")).toBeNull();
  });

  it("shows no badge when the backend omits champion_level entirely", async () => {
    // A backend that predates MRLVL1: the key is absent, and `fetchFactualPool`
    // resolves it to null rather than to 1. The page renders as it always did.
    const legacy = hpPoolAt(null) as Record<string, unknown>;
    delete legacy.championLevel;
    mocks.fetchFactualPool.mockResolvedValue(legacy);
    renderGame("base-hp-duel");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() =>
      expect(screen.getByText("Which champion has more base health?"))
        .toBeInTheDocument());
    expect(screen.queryByTestId("champion-level-badge")).toBeNull();
  });

  it("leaves the two answer cards untouched", async () => {
    mocks.fetchFactualPool.mockResolvedValue(hpPoolAt(20));
    renderGame("base-hp-duel");
    await screen.findByTestId("champion-level-badge");
    // Both champions still dealt, still clickable, still unrevealed.
    expect(await screen.findByRole("button", { name: /Sion/ })).toBeEnabled();
    expect(await screen.findByRole("button", { name: /Ahri/ })).toBeEnabled();
  });
});

describe("standalone League Swipe — the level on the wire", () => {
  it("reads champion_level off the pool response", async () => {
    const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
      "@/lib/league-swipe/api",
    );
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true, category_id: "champion-hp-lvl18-duel",
      prompt: "Which champion has more Health?", unit: " HP",
      higher_wins: true, champion_level: 18, entities: [],
    }), { status: 200, headers: { "content-type": "application/json" } })) as never;
    try {
      const pool = await actual.fetchFactualPool("champion-hp-lvl18-duel");
      expect(pool.championLevel).toBe(18);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("reads a missing champion_level as null, never as 1", async () => {
    const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
      "@/lib/league-swipe/api",
    );
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true, category_id: "champion-hp-duel",
      prompt: "Which champion has more base health?", unit: " HP",
      higher_wins: true, entities: [],
    }), { status: 200, headers: { "content-type": "application/json" } })) as never;
    try {
      const pool = await actual.fetchFactualPool("champion-hp-duel");
      expect(pool.championLevel).toBeNull();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("carries the pool's level onto the matchup it builds", async () => {
    const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
      "@/lib/league-swipe/api",
    );
    const matchup = actual.makeFactualMatchup(hpPoolAt(6).entities, {
      prompt: "Which champion has more Health?", unit: " HP",
      variant: "hp", statLabel: "Health", championLevel: 6,
    });
    expect(matchup?.championLevel).toBe(6);
  });

  it("builds a level-less matchup when the pool has no level", async () => {
    const actual = await vi.importActual<typeof import("@/lib/league-swipe/api")>(
      "@/lib/league-swipe/api",
    );
    const matchup = actual.makeFactualMatchup(MOVE_SPEED_POOL.entities, {
      prompt: "Which champion is faster?", unit: " MS",
      variant: "move_speed", statLabel: "Move Speed", championLevel: null,
    });
    expect(matchup?.championLevel).toBeNull();
  });
});
