/**
 * LC1 — the three-column Ranked lobby: composition, real-data-only rendering,
 * and the RE1 boundary (Academy standing can never read as the Ranked one).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RankedLobbyHero from "./RankedLobbyHero";
import { LOBBY_PANEL_WASH } from "./LobbyPanel";
import type { RankedState } from "@/lib/quiz/featured-mock";
import type { MatchHistoryEntryView, RankedProgressionView } from "@/lib/ranked-public/contracts";

afterEach(cleanup);

const PLACED: RankedState = {
  placementMatchesRemaining: 0,
  isPlaced: true,
  estimatedGain: 25,
  estimatedLoss: 15,
};

const UNPLACED: RankedState = {
  placementMatchesRemaining: 3,
  isPlaced: false,
  estimatedGain: 25,
  estimatedLoss: 15,
};

const PROGRESSION: RankedProgressionView = {
  rating: 1320,
  tier: "diamond",
  nextTier: "challenger",
  nextTierRating: 1450,
  ratingToNext: 130,
  progressPercent: 13,
  rated: true,
  matchesRated: 40,
};

function match(over: Partial<MatchHistoryEntryView>): MatchHistoryEntryView {
  return {
    matchId: `m-${Math.random().toString(36).slice(2)}`,
    viewerOutcome: "win",
    terminalReason: "hp_zero",
    completionReason: null,
    finalRoundNumber: 5,
    completedAt: "2026-08-19T00:00:00Z",
    isBotMatch: false,
    viewerClass: "tank",
    opponentClass: "mage",
    viewerRole: "jungle",
    opponentRole: null,
    opponentDisplayName: "Rival",
    opponentIsBot: false,
    ...over,
  } as MatchHistoryEntryView;
}

function renderHero(over: Partial<React.ComponentProps<typeof RankedLobbyHero>> = {}) {
  const onPlayRanked = vi.fn();
  const utils = render(
    <MemoryRouter>
      <RankedLobbyHero
        progress={null}
        ranked={PLACED}
        onPlayRanked={onPlayRanked}
        rankedProgression={PROGRESSION}
        {...over}
      />
    </MemoryRouter>,
  );
  return { ...utils, onPlayRanked };
}

describe("RankedLobbyHero — three-column composition", () => {
  it("renders the role column, the play column and the profile column", () => {
    renderHero();
    expect(screen.getByTestId("hero-role-column")).toBeTruthy();
    expect(screen.getByTestId("hero-play-column")).toBeTruthy();
    expect(screen.getByTestId("hero-profile-column")).toBeTruthy();
  });

  it("keeps the columns in left → centre → right document order", () => {
    const { container } = renderHero();
    const left = container.querySelector('[data-testid="hero-role-column"]')!;
    const centre = container.querySelector('[data-testid="hero-play-column"]')!;
    const right = container.querySelector('[data-testid="hero-profile-column"]')!;
    const follows = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(left, centre)).toBeTruthy();
    expect(follows(centre, right)).toBeTruthy();
  });

  it("puts the LEAGUECRAFT / RANKED hierarchy and the PLAY gem in the centre", () => {
    renderHero();
    const centre = screen.getByTestId("hero-play-column");
    expect(centre.querySelector("h1")!.textContent).toBe("LEAGUECRAFT");
    expect(centre.textContent).toContain("Ranked");
    expect(centre.querySelector('[data-testid="ranked-play-gem"]')).not.toBeNull();
  });

  it("mirrors the left stage with a personal portrait on the right", () => {
    renderHero();
    expect(screen.getByTestId("ranked-class-carousel")).toBeTruthy();
    const portrait = screen.getByTestId("hero-personal-portrait");
    // Aspect ratio is preserved — the portrait is contained, never stretched.
    expect(portrait.className).toContain("object-contain");
  });

  it("stands each column on its own backing panel, with the centre emphasised", () => {
    renderHero();
    for (const column of ["hero-role-column", "hero-play-column", "hero-profile-column"]) {
      const panel = screen.getByTestId(column).querySelector('[data-testid="hero-panel"]');
      expect(panel, `${column} has no backing panel`).not.toBeNull();
    }
    // Exactly one plate carries the extra emphasis, and it is the CTA column.
    const emphasised = screen.getAllByTestId("hero-panel").filter(
      (p) => p.getAttribute("data-emphasis") === "true",
    );
    expect(emphasised).toHaveLength(1);
    expect(screen.getByTestId("hero-play-column").contains(emphasised[0])).toBe(true);
  });

  it("keeps every panel wash translucent, so the classroom art is never covered", () => {
    // An opaque fill would flatten the lobby into dashboard cards. Every stop
    // of both washes must stay under full alpha.
    for (const wash of Object.values(LOBBY_PANEL_WASH)) {
      const alphas = [...wash.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)].map((m) => Number(m[1]));
      expect(alphas.length).toBeGreaterThan(0);
      expect(Math.max(...alphas)).toBeLessThan(1);
    }
  });

  it("the PLAY gem still drives the host's Ranked action", () => {
    const { onPlayRanked } = renderHero();
    fireEvent.click(screen.getByRole("button", { name: /^Play$/ }));
    expect(onPlayRanked).toHaveBeenCalledTimes(1);
  });
});

describe("RankedLobbyHero — Ranked identity (RE1-owned values, rendered as given)", () => {
  it("shows the tier, the rating and the distance to the next tier", () => {
    renderHero();
    expect(screen.getByRole("heading", { name: "Ranked Diamond", level: 2 })).toBeTruthy();
    expect(screen.getByTestId("hub-ranked-rating").textContent).toContain("1320 Ranked rating");
    expect(screen.getByTestId("rank-progress").textContent).toContain("130 rating to Challenger");
  });

  it("shows NO rating when there is no Ranked standing — never a guessed one", () => {
    const { container } = renderHero({ rankedProgression: null });
    expect(screen.getByRole("heading", { name: "Unranked", level: 2 })).toBeTruthy();
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    expect(screen.queryByTestId("rank-progress")).toBeNull();
    expect(container.textContent).not.toMatch(/\d+ Ranked rating/);
  });

  it("stays UNRANKED through placements even when a rating already exists", () => {
    renderHero({ ranked: UNPLACED, rankedProgression: PROGRESSION });
    expect(screen.getByRole("heading", { name: "Placement Series", level: 2 })).toBeTruthy();
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    expect(screen.getByText("Placement 2/5")).toBeTruthy();
  });

  it("never lets the legacy Academy/quiz ladder reach the competitive identity", () => {
    const { container } = renderHero({
      progress: { rank_name: "Grandmaster", next_rank_name: "Iron", progress_percent: 99 },
    });
    expect(container.textContent).not.toContain("Grandmaster");
    expect(container.textContent).not.toContain("Iron");
  });

  it("labels the Academy crown as ACADEMY, so it cannot read as the Ranked tier", () => {
    renderHero({ progress: { academy_tier: "silver" } });
    const crown = screen.getByTestId("hero-academy-crown");
    expect(crown.textContent).toContain("Academy Silver");
  });

  it("renders no crown at all when there is no Academy standing", () => {
    renderHero({ progress: { attempts: 4 } });
    expect(screen.queryByTestId("hero-academy-crown")).toBeNull();
  });
});

describe("RankedLobbyHero — personal column data honesty", () => {
  it("renders the account's real recent Ranked rows", () => {
    renderHero({
      matchHistory: [
        match({ viewerOutcome: "win", opponentDisplayName: "Rival", viewerRole: "jungle" }),
        match({ viewerOutcome: "loss", opponentIsBot: true, viewerRole: "mid" }),
      ],
    });
    const rows = screen.getAllByTestId("hero-recent-match");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Victory");
    expect(rows[0].textContent).toContain("Rival");
    expect(rows[1].textContent).toContain("Defeat");
    expect(rows[1].textContent).toContain("Bot");
  });

  it("caps the list at the latest three", () => {
    renderHero({ matchHistory: [match({}), match({}), match({}), match({}), match({})] });
    expect(screen.getAllByTestId("hero-recent-match")).toHaveLength(3);
  });

  it("says so when there is no history — it never fabricates a match", () => {
    const { container } = renderHero({ matchHistory: [] });
    expect(screen.getByTestId("hero-recent-empty").textContent).toContain(
      "No ranked matches on record yet",
    );
    expect(container.querySelectorAll('[data-testid="hero-recent-match"]')).toHaveLength(0);
  });

  it("derives the per-role record from those same real rows, with its scope stated", () => {
    renderHero({
      rankedRole: "jungle",
      matchHistory: [
        match({ viewerRole: "jungle", viewerOutcome: "win" }),
        match({ viewerRole: "jungle", viewerOutcome: "loss" }),
        match({ viewerRole: "mid", viewerOutcome: "win" }),
      ],
    });
    const record = screen.getByTestId("ranked-class-record");
    expect(record.textContent).toContain("1W · 1L");
    expect(record.textContent).toContain("Last 3 ranked matches");
  });

  it("shows no per-role record when every row predates roles", () => {
    renderHero({
      rankedRole: "top",
      matchHistory: [match({ viewerRole: null }), match({ viewerRole: null })],
    });
    expect(screen.getByTestId("ranked-class-record").textContent).toContain(
      "No ranked matches on record as Top",
    );
  });

  it("uses the account's real display name, and never invents one for a guest", () => {
    renderHero({ displayName: "Mitchell", signedIn: true });
    expect(screen.getByTestId("hero-display-name").textContent).toBe("Mitchell");
    cleanup();
    renderHero({ displayName: null, signedIn: false });
    expect(screen.getByTestId("hero-display-name").textContent).toBe("Guest");
  });

  it("renders real progress figures, and an em dash where there is no figure", () => {
    renderHero({ progress: { current_streak: 4, best_streak: 9, accuracy: 71.2, attempts: 120 } });
    const strip = screen.getByTestId("hero-stat-strip");
    expect(strip.textContent).toContain("71%");
    expect(strip.textContent).not.toContain("71.2");
    cleanup();
    renderHero({ progress: null });
    expect(screen.getByTestId("hero-stat-strip").textContent).toContain("—");
  });
});

describe("RankedLobbyHero — role selection", () => {
  it("persists a role through the host's callback", () => {
    const onSelectRole = vi.fn();
    renderHero({ rankedRole: "top", onSelectRole });
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(onSelectRole).toHaveBeenCalledWith("jungle");
  });

  it("is read-only, but still browsable, when the host cannot persist a role", () => {
    const { container } = renderHero({ rankedRole: "top" });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(
      container.querySelector('[data-stage="centre"]')!.getAttribute("data-testid"),
    ).toBe("ranked-class-slide-jungle");
  });

  it("shows the account's role beside its identity, by NAME", () => {
    renderHero({ rankedRole: "support" });
    expect(screen.getByTestId("hub-ranked-role").textContent).toBe("Support");
  });
});
