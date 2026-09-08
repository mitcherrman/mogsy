/**
 * Phase 3 — the dossier's own guarantees.
 *
 * The visual pass is allowed to move anything except meaning, so this file
 * pins the things a redesign is most likely to quietly cost: the media slots
 * that must never render a broken image, the pool categories that must name
 * their own sort rather than a judgement, and the progressive disclosure that
 * must be a DISPLAY toggle over rows already in hand.
 *
 * The lane-state and no-H2H guarantees are pinned against the real board in
 * ProPlayMatchupTeam.test.tsx, where they can be checked against a payload.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  MIN_GAMES_FOR_RATE,
  ChampionPoolSummary,
  poolCategories,
} from "./ChampionPool";
import { Disclosure, FinePrint } from "./DossierChrome";
import { ChampionIcon, PlayerPortrait, TeamCrest, monogram } from "./DossierMedia";
import type { DemonstratedPool, PoolChampion } from "@/lib/pro-play/matchupApi";

function champ(over: Partial<PoolChampion> & { key: string }): PoolChampion {
  return {
    games: 1,
    wins: 1,
    losses: 0,
    win_rate: 1,
    first_played_at: null,
    last_played_at: null,
    champion_share: null,
    banned: false,
    ...over,
  };
}

function pool(champions: PoolChampion[], over: Partial<DemonstratedPool> = {}): DemonstratedPool {
  return {
    scope_id: "current_2026",
    scope_label: "2026",
    participation: "participated",
    player_games_in_scope: 100,
    pool_size: champions.length,
    champions,
    selectable: champions.map((c) => c.key),
    banned_from_pool: [],
    note: "served note",
    ...over,
  };
}

// --- media ------------------------------------------------------------------

describe("media slots", () => {
  it("derives a stable monogram from a name", () => {
    expect(monogram("Gen.G")).toBe("GG");
    expect(monogram("Hanwha Life Esports")).toBe("HL");
    expect(monogram("Bin (Chen Ze-Bin)")).toBe("BI");
    expect(monogram("")).toBe("?");
  });

  it("renders a team crest as a designed placeholder, never a broken image", () => {
    render(<TeamCrest name="Bilibili Gaming" shortCode="BLG" />);
    const slot = screen.getByTestId("team-crest");
    expect(slot).toHaveAttribute("data-media-state", "placeholder");
    // No <img> at all — a source-less img is exactly the broken glyph these
    // frames exist to prevent.
    expect(slot.querySelector("img")).toBeNull();
    expect(slot).toHaveTextContent("BLG");
  });

  it("renders a player portrait as a designed placeholder", () => {
    render(<PlayerPortrait name="Faker" />);
    const slot = screen.getByTestId("player-portrait");
    expect(slot).toHaveAttribute("data-media-state", "placeholder");
    expect(slot.querySelector("img")).toBeNull();
  });

  it("falls back rather than breaking when a champion has no stored art", () => {
    render(<ChampionIcon champion="NotAChampion" />);
    const slot = screen.getByTestId("champion-icon");
    expect(slot).toHaveAttribute("data-media-state", "placeholder");
    expect(slot.querySelector("img")).toBeNull();
  });

  it("uses the stored art when the asset store has it", () => {
    render(<ChampionIcon champion="Azir" />);
    const slot = screen.getByTestId("champion-icon");
    expect(slot).toHaveAttribute("data-media-state", "art");
    expect(slot.querySelector("img")).toHaveAttribute("alt", "Azir");
  });
});

// --- pool categories --------------------------------------------------------

describe("champion pool categories", () => {
  const champions = [
    champ({ key: "Azir", games: 13, win_rate: 0.5, last_played_at: "2026-06-12" }),
    champ({ key: "Ryze", games: 9, win_rate: 0.9, last_played_at: "2026-07-08" }),
    champ({ key: "Corki", games: 2, win_rate: 1, last_played_at: "2026-01-02" }),
    champ({ key: "Galio", games: 20, win_rate: 0.1, last_played_at: null }),
  ];

  it("orders 'Most played' by games", () => {
    const cat = poolCategories(champions, 10).find((c) => c.id === "played")!;
    expect(cat.champions.map((c) => c.key)).toEqual(["Galio", "Azir", "Ryze", "Corki"]);
  });

  it("orders 'Most recent' by last played, and omits undated picks", () => {
    const cat = poolCategories(champions, 10).find((c) => c.id === "recent")!;
    expect(cat.champions.map((c) => c.key)).toEqual(["Ryze", "Azir", "Corki"]);
  });

  it("applies a printed minimum-game rule to 'Best record', and prints it", () => {
    const cat = poolCategories(champions, 10).find((c) => c.id === "record")!;
    // Corki's 100% over 2 games is excluded by the threshold, and the reader
    // is told the threshold rather than being left to infer it.
    expect(cat.champions.map((c) => c.key)).toEqual(["Ryze", "Azir", "Galio"]);
    expect(cat.label).toContain(String(MIN_GAMES_FOR_RATE));
  });

  it("names its sort and never claims a signature or comfort pick", () => {
    const labels = poolCategories(champions, 10).map((c) => c.label).join(" ");
    expect(labels).toMatch(/Most played/);
    expect(labels).not.toMatch(/signature|comfort|pocket|best champion|favourite|favorite/i);
  });

  it("omits a category with nothing to say rather than showing it empty", () => {
    // Undated, low-volume picks: no "Most recent", no "Best record".
    const ids = poolCategories([champ({ key: "Zoe", games: 1, win_rate: 1 })], 10).map((c) => c.id);
    expect(ids).toEqual(["played"]);
  });
});

// --- progressive disclosure -------------------------------------------------

describe("champion pool disclosure", () => {
  const many = Array.from({ length: 9 }, (_, i) =>
    champ({ key: `Champ${i}`, games: 9 - i, last_played_at: `2026-0${(i % 9) + 1}-01` }),
  );

  it("summarises first and keeps the full table one click away", () => {
    render(<ChampionPoolSummary pool={pool(many)} poolOmitted={false} preview={2} />);
    expect(screen.queryByTestId("pool-full-table")).toBeNull();
    fireEvent.click(screen.getByTestId("pool-disclosure-toggle"));
    const table = screen.getByTestId("pool-full-table");
    // EVERY row, not the preview — the disclosure is a display toggle, never
    // a filter, and there is no minimum-game floor anywhere.
    for (const c of many) {
      expect(within(table).getByTestId(`pool-row-${c.key}`)).toBeInTheDocument();
    }
  });

  it("keeps the semantic label 'Demonstrated picks' through the visual pass", () => {
    render(<ChampionPoolSummary pool={pool(many)} poolOmitted={false} preview={2} />);
    expect(screen.getByTestId("champion-pool")).toHaveTextContent("Demonstrated picks");
  });

  it("keeps a banned champion visible, marked, in the summary", () => {
    render(
      <ChampionPoolSummary
        pool={pool([champ({ key: "Vi", games: 10, banned: true })])}
        poolOmitted={false}
        preview={3}
      />,
    );
    expect(screen.getAllByTestId("champ-chip-Vi")[0].className).toContain("is-banned");
  });

  it("separates 'did not participate' from a record of zero picks", () => {
    render(
      <ChampionPoolSummary
        pool={pool([], { participation: "did_not_participate" })}
        poolOmitted={false}
        preview={3}
      />,
    );
    expect(screen.getByTestId("pool-dnp")).toHaveTextContent(/not a record of zero picks/i);
  });

  it("declares a bounded fetch rather than an empty bench", () => {
    render(<ChampionPoolSummary pool={null} poolOmitted preview={3} />);
    expect(screen.getByTestId("pool-omitted")).toHaveTextContent(/open the lane/i);
  });
});

// --- chrome -----------------------------------------------------------------

describe("dossier chrome", () => {
  it("keeps fine print in the DOM when collapsed, so it is never lost", () => {
    render(<FinePrint testId="fp">A truthful sentence.</FinePrint>);
    const body = screen.getByText("A truthful sentence.");
    expect(body).toBeInTheDocument();
    expect(body).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /what this means/i }));
    expect(body).toBeVisible();
  });

  it("can open a disclosure by default, for a state that must not be hidden", () => {
    render(
      <Disclosure label="More" testId="d" defaultOpen>
        <span>shown</span>
      </Disclosure>,
    );
    expect(screen.getByText("shown")).toBeVisible();
  });
});
