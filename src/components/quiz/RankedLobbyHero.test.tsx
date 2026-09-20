/**
 * LC1 / MALT — the three-column Ranked lobby: composition, real-data-only
 * rendering, the RE1 boundary (Academy standing can never read as the Ranked
 * one), and the MALT information architecture — one responsibility per sheet.
 *
 * The MALT assertions are the ones that would otherwise rot silently: that
 * Ranked identity appears on the CENTRE sheet and nowhere else, that recent
 * results sit under PLAY rather than in the Academy column, and that
 * placements are a compact state inside the permanent Ranked block rather
 * than a permanent screen of their own.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const sfx = vi.hoisted(() => ({ play: vi.fn() }));

/**
 * PLAY1's sound layer, stubbed to a spy.
 *
 * The real `usePlaySfx` reads the app's one sound-settings store, which
 * constructs the Supabase client — and the pinned jsdom gives that client no
 * working Storage, so importing it turns a clean suite into one carrying an
 * unhandled rejection (see `src/test/localStorageStub.ts`). The gate itself is
 * covered by `src/lib/audio/play-sfx.test.ts`; here it is a spy, which is also
 * exactly what a test asserting "one action, one cue" wants.
 */
vi.mock("@/lib/audio/usePlaySfx", () => ({
  usePlaySfx: () => ({ play: sfx.play }),
}));

import RankedLobbyHero from "./RankedLobbyHero";
import { mobileRankedSwipeDirection } from "./ranked-mobile-carousel";
import { LOBBY_PANEL_WASH } from "./LobbyPanel";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RANKED_ROLE_BLURBS } from "@/lib/ranked-public/roles";
import type { RankedState } from "@/lib/quiz/featured-mock";
import type { MatchHistoryEntryView, RankedProgressionView } from "@/lib/ranked-public/contracts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

function usePhoneViewport() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 1023px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("RankedLobbyHero — mobile shared parchment stage", () => {
  it("opens on Choose Your Role and removes both inactive sheets from interaction", () => {
    usePhoneViewport();
    renderHero();

    const standing = screen.getByTestId("hero-standing-column");
    const role = screen.getByTestId("hero-play-column");
    const record = screen.getByTestId("hero-profile-column");
    expect(role.dataset.mobileActive).toBe("true");
    expect(role).not.toHaveAttribute("aria-hidden");
    expect(standing).toHaveAttribute("aria-hidden", "true");
    expect(standing).toHaveAttribute("inert");
    expect(record).toHaveAttribute("aria-hidden", "true");
    expect(record).toHaveAttribute("inert");
  });

  it("moves role → standing → role → record and disables both endpoints", () => {
    usePhoneViewport();
    renderHero();
    const previous = screen.getByRole("button", { name: "Previous Ranked panel" });
    const next = screen.getByRole("button", { name: "Next Ranked panel" });

    fireEvent.click(previous);
    expect(screen.getByTestId("hero-standing-column").dataset.mobileActive).toBe("true");
    expect(previous).toBeDisabled();

    fireEvent.click(next);
    expect(screen.getByTestId("hero-play-column").dataset.mobileActive).toBe("true");
    fireEvent.click(next);
    expect(screen.getByTestId("hero-profile-column").dataset.mobileActive).toBe("true");
    expect(next).toBeDisabled();

    fireEvent.click(previous);
    expect(screen.getByTestId("hero-play-column").dataset.mobileActive).toBe("true");
  });

  it("tracks the outer carousel with three bars, centred on Choose Your Role", () => {
    usePhoneViewport();
    renderHero();
    const indicator = screen.getByTestId("ranked-mobile-stage-indicator");
    expect(indicator).toHaveAttribute("aria-label", "Choose Your Role, panel 2 of 3");
    expect([...indicator.children].map((mark) => mark.getAttribute("data-active")))
      .toEqual(["false", "true", "false"]);
  });

  it("classifies horizontal swipes and rejects short or vertical gestures", () => {
    expect(mobileRankedSwipeDirection(-80, 4)).toBe("next");
    expect(mobileRankedSwipeDirection(80, 4)).toBe("previous");
    expect(mobileRankedSwipeDirection(-47, 0)).toBeNull();
    expect(mobileRankedSwipeDirection(-70, 100)).toBeNull();
    expect(mobileRankedSwipeDirection(70, 56)).toBeNull();
  });

  it("keeps the inner role arrow independent from the outer carousel", () => {
    usePhoneViewport();
    renderHero();
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(screen.getByTestId("hero-play-column").dataset.mobileActive).toBe("true");
  });

  it("overlaps and stretches the three sheets into one equal-height grid row on mobile only", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.ranked-hero-mobile-stage > \.ranked-hero-slide\s*\{\s*grid-area: 1 \/ 1;/);
    expect(css).not.toMatch(/\.ranked-hero-mobile-stage > \.ranked-hero-slide\s*\{[^}]*align-self:\s*start/);
    expect(css).toMatch(/\.ranked-hero-slide\[data-mobile-active="false"\][\s\S]*?visibility: hidden;/);
    expect(css).toMatch(/ranked-mobile-panel-from-right 180ms ease-out/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*?ranked-hero-mobile-stage[\s\S]*?animation: none !important/);
    expect(css).toMatch(/@media \(max-width: 639\.98px\)[\s\S]*?data-mobile-panel="standing"[\s\S]*?data-mobile-panel="record"/);
    expect(css).toMatch(/data-mobile-panel="standing"\] \.lc-scroll__content,[\s\S]*?data-mobile-panel="record"\] \.lc-scroll__content[\s\S]*?justify-content: space-between/);
  });
});

describe("RankedLobbyHero — three-column composition", () => {
  it("renders the standing column, the play column and the profile column", () => {
    renderHero();
    expect(screen.getByTestId("hero-standing-column")).toBeTruthy();
    expect(screen.getByTestId("hero-play-column")).toBeTruthy();
    expect(screen.getByTestId("hero-profile-column")).toBeTruthy();
  });

  it("keeps the columns in left → centre → right document order", () => {
    const { container } = renderHero();
    const left = container.querySelector('[data-testid="hero-standing-column"]')!;
    const centre = container.querySelector('[data-testid="hero-play-column"]')!;
    const right = container.querySelector('[data-testid="hero-profile-column"]')!;
    const follows = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(left, centre)).toBeTruthy();
    expect(follows(centre, right)).toBeTruthy();
  });

  /* RL1 — the centre sheet says ONE thing. The LEAGUECRAFT wordmark, the
     RANKED eyebrow, the role blurb and the Win/Loss stakes footer were all
     removed and NOTHING replaced them, so this is the guard that no slogan,
     subtitle or helper line creeps back into the column. */
  it("carries one heading and the PLAY gem, and no wordmark or eyebrow", () => {
    renderHero();
    const centre = screen.getByTestId("hero-play-column");
    expect(centre.querySelector("h1")).toBeNull();
    expect(centre.textContent).not.toContain("LEAGUECRAFT");
    const headings = centre.querySelectorAll(
      '[data-testid="column-heading-ceremonial"]',
    );
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain("Choose your role");
    expect(centre.querySelector('[data-testid="ranked-play-gem"]')).not.toBeNull();
  });

  it("prints no stakes footer, no role blurb and no other copy under the seal", () => {
    renderHero();
    const centre = screen.getByTestId("hero-play-column");
    // The stakes row and its two icons.
    expect(centre.textContent).not.toMatch(/Win/i);
    expect(centre.textContent).not.toMatch(/Loss/i);
    expect(centre.textContent).not.toContain("XP");
    // Every role blurb, not only the one the fixture happens to select.
    for (const blurb of Object.values(RANKED_ROLE_BLURBS)) {
      expect(centre.textContent).not.toContain(blurb);
    }
    // The seal is the LAST thing in the column.
    const seal = centre.querySelector('[data-testid="ranked-play-gem"]')!;
    expect(seal.nextElementSibling).toBeNull();
  });

  it("names the selected role BELOW the stage, where its blurb used to sit", () => {
    renderHero({ rankedRole: "support" });
    const label = screen.getByTestId("ranked-class-active-label");
    expect(label.textContent).toBe("Support");
    // In the stage-control row, between the two arrows — not at the mascot's
    // feet, which is the whole point of moving it.
    const row = label.parentElement!;
    expect(row.querySelectorAll("button")).toHaveLength(2);
    const stage = screen
      .getByTestId("hero-play-column")
      .querySelector('[data-testid="ranked-class-slide-support"]')!;
    expect(
      stage.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /* RL1 — the swap, stated as the one thing a reader must be able to do.
     The centre is the sentence "choose your Mogzy role → press Play", and
     nothing may be inserted between the two halves of it. */
  it("reads role stage → PLAY row in the centre, with nothing between them", () => {
    renderHero();
    const centre = screen.getByTestId("hero-play-column");
    const stage = centre.querySelector('[data-testid="ranked-class-carousel"]')!;
    const row = centre.querySelector('[data-testid="play-row"]')!;
    const seal = centre.querySelector('[data-testid="ranked-play-gem"]')!;
    expect(stage).toBeTruthy();
    expect(
      stage.compareDocumentPosition(seal) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // RL2 kept the adjacency and widened what it applies to. The stage's very
    // next sibling is the PLAY ROW, and the seal is in it: the queue context
    // sits BESIDE the seal, never between the stage and the seal. A ledger or
    // an emblem slipped in above the row would still break the instruction.
    expect(stage.nextElementSibling).toBe(row);
    expect(row.contains(seal)).toBe(true);
  });

  it("flanks the seal with the role record and champion knowledge, in that order", () => {
    // Left, seal, right — the approved RL2 composition. The seal keeps the
    // middle slot, so the two flanks can never be read as the call to action.
    renderHero();
    const row = screen.getByTestId("play-row");
    const kids = Array.from(row.children);
    const at = (testId: string) =>
      kids.findIndex((kid) => kid.querySelector(`[data-testid="${testId}"]`));
    expect(at("role-queue-record")).toBe(0);
    expect(at("ranked-play-gem")).toBe(1);
    expect(at("role-champion-knowledge")).toBe(2);
  });

  /* RL1 — the Academy portrait is REMOVED and its space is KEPT.
     Both halves are the requirement: no mascot, and no re-flow of the column
     that held it. A future pass may decide what belongs there; until then the
     box is blank on purpose and must not be collapsed or filled. */
  it("draws no Academy portrait, and gives the space to the analytics carousel", () => {
    // RL1 kept this box blank "awaiting a decision". RL2 is that decision: the
    // Academy's own analytics, and NOT a replacement picture — the portrait
    // stays gone, and nothing here is decorative.
    renderHero();
    expect(screen.queryByTestId("hero-personal-portrait")).toBeNull();
    const space = screen.getByTestId("hero-portrait-space");
    expect(space.querySelector('[data-testid="academy-analytics-carousel"]')).toBeTruthy();
  });

  // MALT compaction pass. The Academy column was the tallest of the three and
  // therefore set the height of the whole rack, which pushed the category rail
  // off the first viewport at 1825x832. It was compacted by removing SPACING,
  // and these are the guards that it stays spacing which is removed and not
  // the picture.
  it("holds the portrait's space open at exactly the heights it had", () => {
    renderHero();
    // The reserved box keeps the 210 / 248 / 280 steps the portrait set, so
    // the name, the crown and the ledger below it land where they always did.
    // Collapsing this box would re-flow the Academy column, which this pass
    // deliberately does not do.
    const stage = screen.getByTestId("hero-portrait-space");
    expect(stage.className).toContain("h-[210px]");
    expect(stage.className).toContain("sm:h-[248px]");
    expect(stage.className).toContain("lg:h-[280px]");
  });

  it("keeps the Academy interval inside the crown's own row, not stacked under it", () => {
    // The crown is 72px tall next to two lines of 38px, so the row was already
    // reserving the height the interval needs. Stacking the interval BELOW the
    // lockup paid for that height a second time. Same crown, same size, same
    // four pieces of information — one block.
    renderHero({ progress: { academy_tier: "silver", academy_xp_to_next: 250 } });
    const standing = screen.getByTestId("hero-academy-standing");
    const crownRow = standing.firstElementChild!;
    const tier = screen.getByTestId("hero-academy-tier");
    // The tier and the interval are inside the SAME row as the crown.
    expect(crownRow.contains(tier)).toBe(true);
    if (/XP to/.test(standing.textContent ?? "")) {
      const interval = [...standing.querySelectorAll("*")].find((el) =>
        /XP to/.test(el.textContent ?? "") && el.children.length === 0,
      )!;
      expect(crownRow.contains(interval)).toBe(true);
    }
    // The row is a bounded, centred object rather than a full-width sprawl:
    // unbounded it stranded the crown at the far edge under a centred name.
    expect(crownRow.className).toContain("mx-auto");
    expect(crownRow.className).toContain("max-w-[17rem]");
  });

  it("stands each column on its own backing panel, with the centre emphasised", () => {
    renderHero();
    for (const column of ["hero-standing-column", "hero-play-column", "hero-profile-column"]) {
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
    expect(order("hero-standing-column")).toBe("left");
    expect(order("hero-profile-column")).toBe("right");
  });

  it("tells the role stage it is standing on parchment", () => {
    // Its five role hues and its neighbour opacity are surface-dependent; the
    // dark-surface values wash out to near-invisible on beige.
    renderHero();
    expect(screen.getByTestId("ranked-class-carousel").dataset.surface).toBe("parchment");
  });

  it("carries no wordmark for the theme to paint over", () => {
    // `.theme-lol h1` sets a flat gold colour and outranks Tailwind's
    // single-class `.text-transparent`, which painted over the clip-to-text
    // gradient. On parchment that flat gold lands near 1.25:1 — invisible.
    renderHero();
    // Asserted on the INLINE declaration, which is what outranks the theme.
    // (`-webkit-text-fill-color` rides along in the same style object; jsdom
    // does not model the prefixed property, so `color` is the checkable half.)
    // RL1: the wordmark is gone from this surface, so the defect it guarded
    // cannot recur here. The guard becomes the removal itself — there is no
    // level-1 heading on the hero at all.
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
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
    // MALT: the heading is the TIER NAME. Saying "Ranked" in it was what made
    // the tier read as a label rather than as a rank; the standing sheet's own
    // column heading already names the track.
    expect(screen.getByRole("heading", { name: "Diamond", level: 2 })).toBeTruthy();
    expect(screen.getByTestId("hub-ranked-rating").textContent).toContain("1320 Ranked rating");
    expect(screen.getByTestId("rank-progress").textContent).toContain("130 rating to Challenger");
  });

  it("shows NO rating when there is no Ranked standing — never a guessed one", () => {
    const { container } = renderHero({ rankedProgression: null });
    // The ladder's floor, because MALT retired "Unranked": Bronze is the
    // lowest RANKED identity and the emblem was already drawing it, so the
    // heading now agrees with the art instead of contradicting it. The
    // account is still awarded nothing — see the `data-baseline` tests.
    expect(screen.getByRole("heading", { name: "Bronze", level: 2 })).toBeTruthy();
    expect(container.textContent).not.toContain("Unranked");
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    expect(screen.queryByTestId("rank-progress")).toBeNull();
    expect(container.textContent).not.toMatch(/\d+ Ranked rating/);
  });

  it("says the standing is unread, and does NOT claim a placement series", () => {
    // A placed account whose progression could not be read is not mid-series.
    // Rendering the placement counter there would invent a state.
    renderHero({ ranked: PLACED, rankedProgression: null });
    expect(screen.getByTestId("hub-ranked-standing-absent").textContent).toContain(
      "No Ranked standing on record yet",
    );
    expect(screen.queryByTestId("hub-ranked-placement")).toBeNull();
  });

  it("keeps placements a compact state inside the Ranked block, not a screen", () => {
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: PROGRESSION });
    // The tier heading is the ladder floor; the placement counter is one
    // line beneath it, inside the same block the placed state uses.
    expect(screen.getByRole("heading", { name: "Bronze", level: 2 })).toBeTruthy();
    expect(screen.getByTestId("hub-ranked-placement").textContent).toContain("Placement 2 / 5");
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    // The permanent "Placement Series" furniture is gone: no headline, no
    // Bronze pill, and no explanatory paragraph.
    expect(container.textContent).not.toContain("Placement Series");
    expect(screen.queryByTestId("hub-ranked-baseline")).toBeNull();
    expect(container.textContent).not.toContain("Complete your placement matches");
  });

  it("has no placement dialog, popup or modal anywhere on the surface", () => {
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: null });
    expect(container.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();
  });

  it("never lets the legacy Academy/quiz ladder reach the competitive identity", () => {
    const { container } = renderHero({
      progress: { rank_name: "Grandmaster", next_rank_name: "Iron", progress_percent: 99 },
    });
    expect(container.textContent).not.toContain("Grandmaster");
    expect(container.textContent).not.toContain("Iron");
  });

  it("binds the Academy emblem to the Academy rank, and names the track", () => {
    // MALT polish: the crown used to float at the corner of the portrait
    // while the words sat far below it, so neither explained the other. They
    // are one lockup now — and the track is still named beside the tier,
    // which is the actual RE1 requirement.
    renderHero({ progress: { academy_tier: "silver" } });
    const standing = screen.getByTestId("hero-academy-standing");
    expect(standing.querySelector("img")).toBeTruthy();
    expect(standing.textContent).toContain("Academy rank");
    expect(screen.getByTestId("hero-academy-tier").textContent?.trim()).toBe("Silver");
    // The emblem's alt still carries the full label for a reader with no
    // layout to read the adjacency from.
    expect(standing.querySelector("img")!.getAttribute("alt")).toContain("Academy Silver");
  });

  it("renders no Academy standing at all when there is none", () => {
    renderHero({ progress: { attempts: 4 } });
    expect(screen.queryByTestId("hero-academy-standing")).toBeNull();
  });

  it("keeps the Academy lockup without a bar when only the tier arrives", () => {
    // A partial payload keeps the crown and the rank and simply draws no
    // interval, rather than rendering half a migration.
    renderHero({ progress: { academy_tier: "gold" } });
    expect(screen.getByTestId("hero-academy-standing").textContent).not.toMatch(/XP to/);
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
    // ONE baseline emblem, since MALT moved Ranked identity off the Academy
    // sheet: the right column's standing chip — the second emblem — went with
    // it, so the centre is now the only place the ladder is drawn.
    const emblems = Array.from(container.querySelectorAll<HTMLImageElement>("img[data-baseline]"));
    expect(emblems.length).toBe(1);
    for (const img of emblems) {
      expect(img.style.filter).toBe("");
      expect(img.closest(".lc-emblem")).toBeTruthy();
    }
  });

  it("draws the Ranked emblem exactly once, ceremonially, on the standing sheet", () => {
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: null });
    const wrappers = Array.from(container.querySelectorAll<HTMLElement>(".lc-emblem"));
    expect(wrappers.map((w) => w.dataset.emphasis)).toEqual(["ceremonial"]);
    expect(wrappers.map((w) => w.dataset.variant)).toEqual(["hero"]);
    // And it is on the STANDING sheet, not merely somewhere on the page.
    expect(screen.getByTestId("hero-standing-column").querySelector(".lc-emblem")).toBeTruthy();
    // Never in the centre: the decision column carries no ceremonial rank art.
    expect(screen.getByTestId("hero-play-column").querySelector(".lc-emblem")).toBeNull();
    const moving = (w: HTMLElement) =>
      w.querySelectorAll(".lc-emblem__glint, .lc-emblem__spark").length;
    expect(moving(wrappers[0])).toBeGreaterThan(0);
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
    expect(screen.getByTestId("hub-ranked-tier").textContent?.trim()).toBe("Bronze");
    expect(container.textContent).not.toContain("Unranked");
    // "baseline" is our internal word for this state; it must never reach the
    // page as a system label.
    expect(container.textContent).not.toMatch(/baseline/i);
  });

  it("hands the centre back to the real tier the moment one exists", () => {
    const { container } = renderHero();
    expect(screen.getByTestId("hub-ranked-tier").textContent?.trim()).toBe("Diamond");
    expect(container.querySelector('img[data-tier="diamond"]')).toBeTruthy();
    expect(container.querySelector("img[data-baseline]")).toBeNull();
    expect(container.textContent).not.toContain("Bronze");
  });

  it("still awards no tier and no rating through placements", () => {
    // The baseline is ART. It must not put an EARNED tier or a number
    // anywhere near the identity while the account is still placing.
    const { container } = renderHero({ ranked: UNPLACED, rankedProgression: PROGRESSION });
    expect(container.querySelector('img[data-baseline="bronze"]')).toBeTruthy();
    expect(container.querySelector("img[data-tier]")).toBeNull();
    expect(screen.queryByTestId("hub-ranked-rating")).toBeNull();
    expect(screen.queryByText("Ranked Bronze")).toBeNull();
  });
});

describe("MALT — one responsibility per parchment", () => {
  const HISTORY = [
    match({ viewerRole: "jungle", viewerOutcome: "win", ratingDelta: 22 }),
    match({ viewerRole: "mid", viewerOutcome: "loss", ratingDelta: -14 }),
  ];

  it("puts Ranked identity on the LEFT standing sheet and nowhere else", () => {
    renderHero({ matchHistory: HISTORY });
    const standing = screen.getByTestId("hero-standing-column");
    const centre = screen.getByTestId("hero-play-column");
    const academy = screen.getByTestId("hero-profile-column");
    expect(standing.textContent).toContain("Diamond");
    expect(standing.textContent).toContain("1320 Ranked rating");
    // The decision column states no tier and no rating.
    expect(centre.textContent).not.toContain("Diamond");
    expect(centre.textContent).not.toContain("1320 Ranked rating");
    // The Academy sheet names no Ranked tier and carries no rank emblem: the
    // standing chip that used to live there was the exact confusion between
    // the two ladders that this architecture exists to end.
    expect(academy.textContent).not.toContain("Diamond");
    expect(academy.textContent).not.toMatch(/Ranked (Bronze|Silver|Gold|Diamond|Challenger)/);
    expect(academy.querySelector(".lc-emblem")).toBeNull();
  });

  it("puts recent Ranked results on the LEFT, under the standing they made", () => {
    renderHero({ matchHistory: HISTORY });
    const standing = screen.getByTestId("hero-standing-column");
    const ledger = screen.getByTestId("hero-recent-matches");
    expect(standing.contains(ledger)).toBe(true);
    expect(screen.getByTestId("hero-profile-column").contains(ledger)).toBe(false);
    expect(screen.getByTestId("hero-play-column").contains(ledger)).toBe(false);
    // Under the standing block in document order, which is the reading order.
    const html = standing.innerHTML;
    expect(html.indexOf("hub-ranked-tier")).toBeLessThan(html.indexOf("hero-recent-matches"));
  });

  it("puts role SELECTION in the CENTRE, and its record with the standing", () => {
    renderHero({ rankedRole: "jungle", matchHistory: HISTORY });
    const centre = screen.getByTestId("hero-play-column");
    expect(centre.querySelector('[data-testid="ranked-class-carousel"]')).toBeTruthy();
    expect(
      screen.getByTestId("hero-standing-column").querySelector(
        '[data-testid="ranked-class-carousel"]',
      ),
    ).toBeNull();
    // The role's own record is a RECORD, so it reads on the record sheet —
    // and it still follows the role the centre stage is pointing at.
    const ledger = screen.getByTestId("role-mastery-ledger");
    expect(screen.getByTestId("hero-standing-column").contains(ledger)).toBe(true);
    expect(ledger.getAttribute("data-role")).toBe("jungle");
  });

  it("gives the role choice a ceremonial heading, and only that one", () => {
    const { container } = renderHero();
    const ceremonial = container.querySelectorAll('[data-testid="column-heading-ceremonial"]');
    expect(ceremonial).toHaveLength(1);
    expect(screen.getByTestId("hero-play-column").contains(ceremonial[0])).toBe(true);
    expect(ceremonial[0].textContent).toContain("Choose your role");
  });

  it("puts long-term personal records on the RIGHT, as ledger rows", () => {
    renderHero({ progress: { attempts: 120, accuracy: 71.2, current_streak: 4, best_streak: 9 } });
    const records = screen.getByTestId("hero-personal-records");
    expect(screen.getByTestId("hero-profile-column").contains(records)).toBe(true);
    expect(records.textContent).toContain("Questions answered");
    expect(records.textContent).toContain("Best streak");
    // Ledger LINES, not the four rounded stat tiles this replaced.
    expect(records.querySelectorAll('[data-testid="ledger-row"]').length).toBeGreaterThan(3);
    expect(screen.queryByTestId("hero-stat-strip")).toBeNull();
  });
});

describe("MALT — the role mastery ledger (derived from real rows only)", () => {
  it("counts games, record, win rate, rating swing and recency for the role", () => {
    renderHero({
      rankedRole: "jungle",
      matchHistory: [
        match({ viewerRole: "jungle", viewerOutcome: "win", ratingDelta: 20 }),
        match({ viewerRole: "jungle", viewerOutcome: "win", ratingDelta: 18 }),
        match({ viewerRole: "jungle", viewerOutcome: "loss", ratingDelta: -12 }),
        match({ viewerRole: "mid", viewerOutcome: "win", ratingDelta: 25 }),
      ],
    });
    const ledger = screen.getByTestId("role-mastery-ledger");
    expect(ledger.textContent).toContain("2W · 1L");
    expect(ledger.textContent).toContain("+26");
    // The summary band leads with the win rate, because the product has no
    // mastery score to lead with — see the demo-score tests below.
    expect(screen.getByTestId("role-mastery-figure").textContent?.trim()).toBe("67%");
    expect(ledger.textContent).toContain("Recent win rate");
  });

  it("follows the role the reader is BROWSING, not only the saved one", () => {
    renderHero({
      rankedRole: "top",
      matchHistory: [match({ viewerRole: "jungle", viewerOutcome: "win", ratingDelta: 9 })],
    });
    expect(screen.getByTestId("role-mastery-ledger").getAttribute("data-role")).toBe("top");
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(screen.getByTestId("role-mastery-ledger").getAttribute("data-role")).toBe("jungle");
  });

  it("invents nothing for a role with no rows — em dashes, and it says so", () => {
    renderHero({ rankedRole: "support", matchHistory: [] });
    const ledger = screen.getByTestId("role-mastery-ledger");
    expect(screen.getByTestId("role-mastery-figure").textContent?.trim()).toBe("—");
    expect(ledger.textContent).not.toMatch(/\d+%/);
    expect(screen.getByTestId("role-mastery-empty").textContent).toContain(
      "No ranked games on this role yet",
    );
  });
});

describe("MALT — scope honesty without a footnote", () => {
  const ROWS = [
    match({ viewerRole: "jungle", viewerOutcome: "win", ratingDelta: 20 }),
    match({ viewerRole: "jungle", viewerOutcome: "loss", ratingDelta: -12 }),
  ];

  it("states the scope in the LABELS, never as a 'last N matches' footnote", () => {
    // The owner asked for the footnote to go. It cannot simply be deleted:
    // `/api/ranked/history` is capped server-side at 50 rows, so these are
    // recent form and can never be lifetime totals — dropping the wording
    // while keeping the numbers would be the misrepresentation, not the fix.
    // So the scope moved onto the metrics' own faces.
    const { container } = renderHero({ rankedRole: "jungle", matchHistory: ROWS });
    expect(container.textContent).not.toMatch(/Last \d+ ranked matches/i);
    const ledger = screen.getByTestId("role-mastery-ledger");
    expect(ledger.textContent).toContain("Recent win rate");
    expect(ledger.textContent).toContain("Recent record");
    expect(ledger.textContent).toContain("Recent matches");
  });

  it("never calls a windowed figure a lifetime or all-time one", () => {
    const { container } = renderHero({ rankedRole: "jungle", matchHistory: ROWS });
    const ledger = screen.getByTestId("role-mastery-ledger");
    expect(ledger.textContent).not.toMatch(/lifetime|all[- ]time|career|total/i);
  });
});

describe("MALT — the Role Mastery summary band (no invented score)", () => {
  const ROWS = [
    match({ viewerRole: "mid", viewerOutcome: "win", ratingDelta: 20 }),
    match({ viewerRole: "mid", viewerOutcome: "win", ratingDelta: 18 }),
    match({ viewerRole: "mid", viewerOutcome: "loss", ratingDelta: -12 }),
  ];

  it("shows a REAL account its own recent win rate, never a score", () => {
    // The product has no mastery score. A real account is given a neutral
    // summary of figures it can verify in its own history instead.
    renderHero({ rankedRole: "mid", matchHistory: ROWS });
    expect(screen.getByTestId("role-mastery-figure").textContent?.trim()).toBe("67%");
    expect(screen.getByTestId("role-mastery-ledger").textContent).toContain("Recent win rate");
  });

  it("shows a score ONLY when a caller explicitly supplies a demo one", () => {
    renderHero({
      rankedRole: "mid",
      matchHistory: ROWS,
      demoRoleMastery: { mid: { score: 742, label: "Adept" } },
    });
    expect(screen.getByTestId("role-mastery-figure").textContent?.trim()).toBe("742");
    expect(screen.getByTestId("role-mastery-ledger").textContent).toContain("Adept");
  });

  it("falls back to the honest figure for a role the demo has no score for", () => {
    renderHero({
      rankedRole: "mid",
      matchHistory: ROWS,
      demoRoleMastery: { support: { score: 61, label: "Novice" } },
    });
    expect(screen.getByTestId("role-mastery-figure").textContent?.trim()).toBe("67%");
  });

  it("keeps the record beside the figure, so a score can never stand alone", () => {
    renderHero({
      rankedRole: "mid",
      matchHistory: ROWS,
      demoRoleMastery: { mid: { score: 742, label: "Adept" } },
    });
    // Whatever fills the figure, the real W-L is printed next to it — a
    // summary that disagreed with the record beside it would be decorative.
    expect(screen.getByTestId("role-mastery-summary").textContent).toContain("2W · 1L");
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
    // THREE, and the cap is a fold constraint rather than a taste. A populated
    // ledger makes the centre the tallest of the three columns and so sets the
    // height of the whole rack; the fourth row took it to 763px, past what the
    // first screen at 1825x832 can carry, and pushed the category rail out of
    // the viewport for exactly the reader most likely to have a full ledger.
    // See RECENT_LEDGER_ROWS.
    renderHero({ matchHistory: [match({}), match({}), match({}), match({}), match({})] });
    expect(screen.getAllByTestId("hero-recent-match")).toHaveLength(3);
  });

  it("shows an applied rating delta, and shows nothing when there is none", () => {
    renderHero({
      matchHistory: [
        match({ viewerOutcome: "win", ratingDelta: 22 }),
        match({ viewerOutcome: "loss", ratingDelta: null }),
      ],
    });
    const rows = screen.getAllByTestId("hero-recent-match");
    expect(rows[0].querySelector('[data-testid="hero-recent-delta"]')!.textContent).toBe("+22");
    // A skipped or pre-F2.2 result carries no number at all — never a zero
    // standing in for "we do not know".
    expect(rows[1].querySelector('[data-testid="hero-recent-delta"]')).toBeNull();
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
    const record = screen.getByTestId("role-mastery-ledger");
    expect(record.textContent).toContain("1W · 1L");
    // Only the JUNGLE rows are counted; the mid row belongs to another role.
    expect(record.textContent).toContain("Recent record");
    expect(screen.getByTestId("role-mastery-figure").textContent?.trim()).toBe("50%");
  });

  it("shows no per-role record when every row predates roles", () => {
    renderHero({
      rankedRole: "top",
      matchHistory: [match({ viewerRole: null }), match({ viewerRole: null })],
    });
    expect(screen.getByTestId("role-mastery-empty").textContent).toContain(
      "No ranked games on this role yet",
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
    const strip = screen.getByTestId("hero-personal-records");
    expect(strip.textContent).toContain("71%");
    expect(strip.textContent).not.toContain("71.2");
    cleanup();
    renderHero({ progress: null });
    expect(screen.getByTestId("hero-personal-records").textContent).toContain("—");
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

  it("names the account's role in words on the sheet that owns role identity", () => {
    renderHero({ rankedRole: "support" });
    // RL1: role identity is the CENTRE sheet's now. A role is never
    // communicated by mascot alone, so the name is printed beside it.
    const centre = screen.getByTestId("hero-play-column");
    expect(centre.textContent).toContain("Support");
    // The Academy sheet does not restate it — one owner per fact is the
    // whole architecture.
    expect(screen.queryByTestId("hub-ranked-role")).toBeNull();
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
