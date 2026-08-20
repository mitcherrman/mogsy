/**
 * LC1 — the three-column Ranked lobby: composition, real-data-only rendering,
 * and the RE1 boundary (Academy standing can never read as the Ranked one).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RankedLobbyHero from "./RankedLobbyHero";
import { LOBBY_PANEL_WASH } from "./LobbyPanel";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("keeps every plate wash translucent, so the classroom art is never covered", () => {
    // The `plate` variant still backs the study panel below the hero. An
    // opaque fill would flatten it into a dashboard card, so every stop of
    // both washes must stay under full alpha.
    for (const wash of Object.values(LOBBY_PANEL_WASH)) {
      const alphas = [...wash.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)].map((m) => Number(m[1]));
      expect(alphas.length).toBeGreaterThan(0);
      expect(Math.max(...alphas)).toBeLessThan(1);
    }
  });

  it("stands all three columns on the parchment scroll, never on the glass plate", () => {
    // The whole point of the shell: one material for the rack. A column that
    // fell back to `plate` would be a dark card sitting in a row of scrolls.
    renderHero();
    const panels = screen.getAllByTestId("hero-panel");
    expect(panels).toHaveLength(3);
    for (const panel of panels) {
      expect(panel.dataset.variant).toBe("scroll");
    }
  });

  it("builds each scroll from three slices, so the rolls are never stretched", () => {
    // The asset's ornamental head and foot are fixed-ratio boxes and only the
    // plain middle takes up a column's extra length. Collapsing this to a
    // single stretched background is exactly the distortion to avoid.
    renderHero();
    for (const panel of screen.getAllByTestId("hero-panel")) {
      const shell = panel.querySelector(".lc-scroll__sheet")!;
      expect(shell, "the scroll has no shell").not.toBeNull();
      // Inert and unnarrated: it is the material, not part of the meaning.
      expect(shell.getAttribute("aria-hidden")).toBe("true");
      expect(shell.querySelector(".lc-scroll__cap--top")).not.toBeNull();
      expect(shell.querySelector(".lc-scroll__body")).not.toBeNull();
      expect(shell.querySelector(".lc-scroll__cap--foot")).not.toBeNull();
      // The foot roll rides the unfurl edge, so it must sit OUTSIDE the
      // clipped region or the reveal would cut it in half.
      expect(shell.querySelector(".lc-scroll__reveal .lc-scroll__cap--foot")).toBeNull();
    }
  });

  it("gives the three scrolls distinct entrance positions, with the CTA first", () => {
    renderHero();
    const order = (column: string) =>
      screen.getByTestId(column).querySelector('[data-testid="hero-panel"]')!.getAttribute("data-order");
    expect(order("hero-play-column")).toBe("centre");
    expect(order("hero-role-column")).toBe("left");
    expect(order("hero-profile-column")).toBe("right");
  });

  it("tells the role stage it is standing on parchment", () => {
    // Its five role hues and its neighbour opacity are surface-dependent; the
    // dark-surface values wash out to near-invisible on beige.
    renderHero();
    expect(screen.getByTestId("ranked-class-carousel").dataset.surface).toBe("parchment");
  });

  it("lets the wordmark's gradient reach the glyphs", () => {
    // `.theme-lol h1` sets a flat gold colour and outranks Tailwind's
    // single-class `.text-transparent`, which painted over the clip-to-text
    // gradient. On parchment that flat gold lands near 1.25:1 — invisible.
    renderHero();
    // Asserted on the INLINE declaration, which is what outranks the theme.
    // (`-webkit-text-fill-color` rides along in the same style object; jsdom
    // does not model the prefixed property, so `color` is the checkable half.)
    const wordmark = screen.getByRole("heading", { name: "LEAGUECRAFT", level: 1 });
    expect(wordmark.style.color).toBe("transparent");
    expect(wordmark.className).toContain("bg-clip-text");
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

describe("RankedLobbyHero — the Bronze baseline (presentation only)", () => {
  it("shows the ladder's Bronze floor, not the off-ladder unranked emblem", () => {
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: null });
    const emblems = Array.from(container.querySelectorAll("img"))
      .map((img) => img.getAttribute("src") ?? "")
      .filter((src) => src.includes("assets/ranks/"));
    expect(emblems.length).toBeGreaterThan(0);
    expect(emblems.every((src) => src.includes("bronze"))).toBe(true);
    expect(emblems.some((src) => src.includes("unranked"))).toBe(false);
  });

  it("marks the baseline emblem as a baseline, never as an awarded tier", () => {
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: null });
    const emblem = container.querySelector('img[data-baseline="bronze"]') as HTMLImageElement;
    expect(emblem).toBeTruthy();
    // Never carries `data-tier`: that attribute means "this is the account's
    // tier", and the baseline is explicitly not one.
    expect(emblem.hasAttribute("data-tier")).toBe(false);
    expect(emblem.getAttribute("alt")).toMatch(/baseline/i);
  });

  it("draws the baseline through the shared component, never with an inline filter", () => {
    // Both baseline emblems are the same tier and have to read as the same
    // metal. That is now enforced structurally — one component, one tint in
    // `index.css` — rather than by two call sites agreeing on a filter
    // string. An inline filter here would also be unbeatable by the sheet,
    // which is what stopped the centre emblem from taking its glow.
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: null });
    const emblems = Array.from(container.querySelectorAll<HTMLImageElement>("img[data-baseline]"));
    expect(emblems.length).toBe(2);
    for (const img of emblems) {
      expect(img.style.filter).toBe("");
      expect(img.closest(".lc-emblem")).toBeTruthy();
    }
  });

  it("makes the centre emblem the ceremonial one and the right column's the quieter", () => {
    // The hierarchy this pass exists for, asserted where a reader can see it:
    // one ceremonial emblem per page, and the supporting one visibly
    // subordinate — same art, same state, less light.
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: null });
    const wrappers = Array.from(container.querySelectorAll<HTMLElement>(".lc-emblem"));
    expect(wrappers.map((w) => w.dataset.emphasis)).toEqual(["ceremonial", "standard"]);
    expect(wrappers.map((w) => w.dataset.variant)).toEqual(["hero", "standard"]);

    const moving = (w: HTMLElement) =>
      w.querySelectorAll(".lc-emblem__glint, .lc-emblem__spark").length;
    // Both are lit and both move — the difference is degree, not a switch.
    expect(moving(wrappers[1])).toBeGreaterThan(0);
    expect(moving(wrappers[0])).toBeGreaterThan(moving(wrappers[1]));
  });

  it("keeps the placement emblem radiant — it is a ceremonial marker, not a placeholder", () => {
    // The reversal. A dimmed emblem directly above the PLAY seal read as a
    // broken image; what marks the state is `data-baseline` and the copy
    // around it, not an absence of light.
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: null });
    const hero = container.querySelector<HTMLElement>('.lc-emblem[data-variant="hero"]')!;
    expect(hero.dataset.baseline).toBe("bronze");
    expect(hero.dataset.tier).toBeUndefined();
    expect(hero.querySelector(".lc-emblem__halo")).toBeTruthy();
    expect(hero.querySelector(".lc-emblem__glint")).toBeTruthy();
    expect(hero.querySelectorAll(".lc-emblem__spark").length).toBeGreaterThan(0);
  });

  it("names the state as the ladder's floor rather than as exclusion from it", () => {
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: null });
    expect(screen.getByTestId("hub-ranked-baseline").textContent?.trim()).toBe("Bronze");
    expect(container.textContent).not.toContain("Unranked");
    // "baseline" is our internal word for this state. The page says
    // "Placement Series" and "Rating set after placements"; it must not also
    // hand the reader a system label.
    expect(container.textContent).not.toMatch(/baseline/i);
  });

  it("keeps the right column in the SAME standing state as the centre", () => {
    renderHero({ ranked: UNPLACED, rankedProgression: null });
    expect(screen.getByTestId("hero-ranked-standing").textContent?.trim()).toBe("Bronze");
  });

  it("hands the columns back to the real tier the moment one exists", () => {
    const { container } = renderHero();
    expect(screen.getByTestId("hero-ranked-standing").textContent).toContain("Ranked Diamond");
    expect(container.querySelector('img[data-tier="diamond"]')).toBeTruthy();
    expect(container.querySelector("img[data-baseline]")).toBeNull();
    expect(container.textContent).not.toContain("Bronze");
  });

  it("still awards no tier and no rating through placements", () => {
    // The baseline is ART. It must not put a tier name or a number anywhere
    // near the identity while the account is still placing.
    renderHero({ ranked: UNPLACED, rankedProgression: PROGRESSION });
    expect(screen.getByRole("heading", { name: "Placement Series", level: 2 })).toBeTruthy();
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    expect(screen.queryByText("Ranked Bronze")).toBeNull();
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

/**
 * The scroll shell is CSS, and the two defects it has actually shipped were
 * both invisible to a DOM test: a filter list that silently voided itself, and
 * a group selector that silently un-positioned the foot roll. Neither threw,
 * neither failed a render, and jsdom applies no stylesheet — so these read the
 * source and assert the two shapes directly.
 */
describe("the parchment shell's CSS invariants", () => {
  // Vitest runs from the project root; `import.meta.url` is not a file: URL
  // once the test has been through the transform pipeline.
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

  it("never sets the scroll tint to a bare `none`", () => {
    // `--lc-scroll-tint` is substituted into a filter LIST alongside the
    // drop-shadows. `filter: drop-shadow(…) none` is invalid — the keyword is
    // only legal on its own — so a `none` here silently voids the whole
    // filter, and both flanking scrolls lose their shadow AND their tone.
    // The identity value is `brightness(1)`.
    const tints = [...css.matchAll(/--lc-scroll-tint:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(tints.length).toBeGreaterThan(0);
    for (const tint of tints) {
      expect(tint, "the identity filter is brightness(1), never `none`").not.toBe("none");
    }
  });

  it("never sets `position` on the whole cap group", () => {
    // `.lc-scroll__cap--foot` is absolute — it rides the unfurl edge. A rule
    // matching `.lc-scroll__cap` sits at the SAME specificity, so declaring
    // `position` there and losing the ordering coin-toss drops the foot roll
    // back into the flex column, which shortens the reveal and strands the
    // roll below the sheet.
    const groupRules = [...css.matchAll(/(^|\n)\.lc-scroll__cap\s*[,{][^}]*}/g)].map((m) => m[0]);
    expect(groupRules.length).toBeGreaterThan(0);
    for (const rule of groupRules) {
      expect(rule, "scope position to --top, never the cap group").not.toMatch(/[^-]position:/);
    }
  });

  it("masks every ageing overlay with the parchment's own alpha", () => {
    // Unmasked, a multiply overlay is a rectangle: it darkens the scroll's
    // transparent corners too, which puts a dark box behind every scroll —
    // the exact pasted-on look the ageing exists to remove.
    const overlay = css.slice(
      css.indexOf(".lc-scroll__cap::after,"),
      css.indexOf(".lc-scroll__cap::after,") + 600,
    );
    expect(overlay).toContain("mix-blend-mode: multiply");
    expect(overlay).toContain("mask-image: var(--lc-parchment)");
    expect(overlay).toContain("-webkit-mask-image: var(--lc-parchment)");
  });
});
