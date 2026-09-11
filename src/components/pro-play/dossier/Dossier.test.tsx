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

  it("no longer prints a heading over the only thing in the block", () => {
    // Owner decision. The board still prints the server's pool sentence, which
    // is where the "demonstrated, not able-to-play" guarantee actually lives —
    // that assertion is in ProPlayMatchupTeam.test.tsx, against the real board.
    render(<ChampionPoolSummary pool={pool(many)} poolOmitted={false} preview={2} />);
    const block = screen.getByTestId("champion-pool");
    expect(block).not.toHaveTextContent("Champion Arsenal");
    expect(block).not.toHaveTextContent("Demonstrated picks");
    // The sorts still name themselves.
    expect(block).toHaveTextContent("Most played");
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

// --- the board's density pass ------------------------------------------------

describe("champion tiles on the five-lane board", () => {
  const arsenal = [
    champ({ key: "Jayce", games: 13, wins: 12, losses: 1, win_rate: 0.923, last_played_at: "2026-07-06" }),
    champ({ key: "Ambessa", games: 11, wins: 7, losses: 4, win_rate: 0.636, last_played_at: "2026-06-01" }),
    champ({ key: "K'Sante", games: 6, wins: 5, losses: 1, win_rate: 0.833, last_played_at: "2026-05-02" }),
  ];

  it("renders no champion NAME on the face of a tile", () => {
    // The complaint this pass answers: name-bearing chips wrap into ragged
    // columns whose widths are an accident of naming. The name lives in the
    // tooltip now, so the tile is the icon and its numbers.
    render(<ChampionPoolSummary pool={pool(arsenal)} poolOmitted={false} preview={5} />);
    for (const key of ["Jayce", "Ambessa", "K'Sante"]) {
      const tile = screen.getByTestId(`champ-chip-${key}`);
      expect(tile.textContent).not.toContain(key);
      // What it DOES show is the same shape for every tile, which is what
      // makes the row a grid: wins over games, then the rate. LIVE4 spaced the
      // slash — `10/13` at tile size reads as one token, and the pool's own
      // legend now names what the two numbers are.
      expect(tile.textContent).toMatch(/\d+ \/ \d+/);
    }
  });

  it("reaches the champion name by hover, keyboard and touch", () => {
    render(<ChampionPoolSummary pool={pool(arsenal)} poolOmitted={false} preview={5} />);
    const tile = screen.getByTestId("champ-chip-Jayce");
    // A real focusable control, not a hover-only div: keyboard and screen
    // reader both reach it, and `title` covers touch where hover does not exist.
    expect(tile.tagName).toBe("BUTTON");
    expect(tile.getAttribute("aria-label")).toContain("Jayce");
    expect(tile.getAttribute("title")).toContain("Jayce");
  });

  it("puts in the tooltip only what the tile does not already print", () => {
    render(<ChampionPoolSummary pool={pool(arsenal)} poolOmitted={false} preview={5} />);
    const label = screen.getByTestId("champ-chip-Jayce").getAttribute("aria-label") ?? "";
    expect(label).toContain("12–1");            // record — not on the tile
    expect(label).toContain("2026-07-06");      // last played — not on the tile
    expect(label.match(/Jayce/g)).toHaveLength(1);
  });

  it("shows far more of the pool than the server's preview hint", () => {
    // `preview` was the old cap and is now a FLOOR. A 12-champion pool used to
    // surface five; it surfaces all twelve.
    const twelve = Array.from({ length: 12 }, (_, i) =>
      champ({ key: `C${i}`, games: 12 - i, win_rate: 0.5 }),
    );
    render(<ChampionPoolSummary pool={pool(twelve)} poolOmitted={false} preview={5} />);
    const grid = screen.getByTestId("pool-cat-played");
    expect(within(grid).getAllByTestId(/^champ-chip-/)).toHaveLength(12);
  });

  it("offers the whole pool by its real size, never the preview count", () => {
    // "Show all 20", not "14 of 20" and never "top 14": the preview count is
    // layout, and printing it would make a layout number look like a fact
    // about the player.
    const many = Array.from({ length: 20 }, (_, i) =>
      champ({ key: `C${i}`, games: 20 - i, win_rate: 0.5 }),
    );
    render(<ChampionPoolSummary pool={pool(many)} poolOmitted={false} preview={5} />);
    const expand = screen.getByTestId("pool-expand");
    expect(expand).toHaveTextContent("Show all 20");
    expect(screen.getByTestId("pool-cat-played").textContent).not.toMatch(/top \d+|14 of 20/i);
  });

  it("expands to the full pool in place and collapses back", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      champ({ key: `C${i}`, games: 20 - i, win_rate: 0.5 }),
    );
    render(<ChampionPoolSummary pool={pool(many)} poolOmitted={false} preview={5} />);
    const grid = () => screen.getByTestId("pool-cat-played");
    expect(within(grid()).getAllByTestId(/^champ-chip-/)).toHaveLength(12);

    fireEvent.click(screen.getByTestId("pool-expand"));
    expect(within(grid()).getAllByTestId(/^champ-chip-/)).toHaveLength(20);
    expect(screen.getByTestId("pool-expand")).toHaveTextContent("Show fewer");
    // In place: the card is still the only thing rendered, no navigation.
    expect(screen.getByTestId("pool-expand")).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByTestId("pool-expand"));
    expect(within(grid()).getAllByTestId(/^champ-chip-/)).toHaveLength(12);
  });

  it("offers no expander when the whole pool already fits", () => {
    // An expander that expands nothing is a lie about there being more.
    const few = Array.from({ length: 4 }, (_, i) =>
      champ({ key: `C${i}`, games: 4 - i, win_rate: 0.5 }),
    );
    render(<ChampionPoolSummary pool={pool(few)} poolOmitted={false} preview={5} />);
    expect(screen.queryByTestId("pool-expand")).toBeNull();
  });

  it("uses wins / games, not an ambiguous games count", () => {
    render(
      <ChampionPoolSummary
        pool={pool([champ({ key: "Jayce", games: 13, wins: 10, losses: 3, win_rate: 0.769 })])}
        poolOmitted={false}
        preview={5}
      />,
    );
    const tile = screen.getByTestId("champ-chip-Jayce");
    expect(tile).toHaveTextContent("10 / 13");
    // `g` reads as gold on a League page.
    expect(tile.textContent).not.toMatch(/13g/);
    // LIVE4: the grammar is stated once for the grid, not abbreviated on the
    // tile. The legend is what makes two bare numbers legible.
    expect(screen.getByTestId("pool-legend")).toHaveTextContent(/wins \/ games/i);
    expect(tile.textContent).not.toMatch(/\bW\/G\b|\bWR\b/);
  });

  it("renders the other orderings as icon-only strips, not a third arsenal", () => {
    // The repetition complaint: the same four champions rendered as full tiles
    // three times. They are orderings, so they cost one line each now.
    render(<ChampionPoolSummary pool={pool(arsenal)} poolOmitted={false} preview={5} />);
    const recent = screen.getByTestId("pool-cat-recent");
    expect(within(recent).queryAllByTestId(/^champ-chip-/)).toHaveLength(0);
    const glyphs = within(recent).getAllByTestId(/^champ-glyph-recent-/);
    expect(glyphs.length).toBeGreaterThan(0);
    expect(glyphs[0].textContent).not.toContain("Jayce");
    expect(glyphs[0].getAttribute("aria-label")).toContain("Jayce");
  });

  it("keeps a banned champion visible and struck through", () => {
    const banned = [champ({ key: "Vi", games: 4, win_rate: 0.5, banned: true })];
    render(<ChampionPoolSummary pool={pool(banned)} poolOmitted={false} preview={5} />);
    const tile = screen.getByTestId("champ-chip-Vi");
    expect(tile.className).toContain("is-banned");
    expect(tile.getAttribute("aria-label")).toContain("banned");
  });
});

describe("the lane portrait", () => {
  it("is rendered at the board's largest slot", () => {
    render(<PlayerPortrait name="Faker" size="xl" />);
    const slot = screen.getByTestId("player-portrait");
    // Structural rather than pixel-exact: the card asks for the big slot.
    expect(slot.className).toMatch(/h-\[4\.5rem\]|md:h-28/);
  });

  it("still falls back to a monogram with no media", () => {
    render(<PlayerPortrait name="Faker" size="xl" />);
    const slot = screen.getByTestId("player-portrait");
    expect(slot).toHaveAttribute("data-media-state", "placeholder");
    expect(slot.querySelector("img")).toBeNull();
  });
});
