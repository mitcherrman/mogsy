/**
 * RM1 Pass 2 — the duel banner, and the module-history strip inside it.
 *
 * Two things are fixed here and they are the two the presentation seam exists
 * for: Ranked gets the banner, and EVERY OTHER CALLER still gets the card it
 * had. The second is the one worth a test — the banner is visible the moment
 * anyone looks at Ranked, and a Daily Challenge column that quietly became a
 * pointed banner is exactly the regression nobody would look for.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CombatantPanel } from "./CombatantPanel";
import type { CombatantView, RoundHistoryEntry } from "@/lib/ranked-core/viewTypes";

const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "you", name: "You", tag: "Top", side: "player", classId: "tank",
  roleId: "top", identityMode: "role", score: 14,
  hp: 150, maxHp: 170, xp: 0, level: 1, nextLevelThreshold: null,
  currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: null,
  hasAbilitySelected: false, ...over,
});

/** `[base, bonus]` per module, oldest first. `null` base = never scored. */
const history = (
  rows: readonly (readonly [number | null, number])[],
): RoundHistoryEntry[] => rows.map(([base, bonus], i) => ({
  roundNumber: i + 1,
  outcome: base === null ? "timed_out" : base > 0 ? "correct" : "incorrect",
  basePoints: base,
  speedBonusPoints: base === null ? null : bonus,
  pointsAwarded: base === null ? null : base + bonus,
  dealt: 0, taken: 0, absorbed: 0, hpBefore: 150, hpAfter: 150, timeExpired: false,
}));

const TEN = history([
  [2, 1], [1, 0], [0, 0], [3, 1], [2, 0], [1, 0], [2, 1], [0, 0], [3, 1], [1, 0],
]);

describe("the duel banner (presentation: banner)", () => {
  it("replaces the card's chrome rather than layering over it", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />);
    const column = screen.getByTestId("combatant-you");
    expect(column).toHaveAttribute("data-presentation", "banner");
    expect(column.className).toContain("ranked-banner");
    // A ring and a rounded border trace a RECTANGLE; the banner's silhouette
    // comes to a point, so the card's vocabulary is dropped, not stacked.
    expect(column.className).not.toContain("rounded-xl");
    expect(column.className).not.toContain("border-2");
    expect(column.className).not.toContain("bg-card");
  });

  it("publishes side and outcome for the banner's own edge to read", () => {
    render(<CombatantPanel combatant={combatant({ side: "opponent" })}
      presentation="banner" damage={TEN} outcome="correct" />);
    const column = screen.getByTestId("combatant-you");
    expect(column).toHaveAttribute("data-side", "opponent");
    expect(column).toHaveAttribute("data-outcome", "correct");
  });

  it("keeps every part of the column the plan preserves", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner"
      progressionEnabled={false} damage={TEN} />);
    const column = screen.getByTestId("combatant-you");
    // Mascot, identity, role, score, history, answer state — all still here.
    expect(column.querySelector('[data-testid="role-crest"]')).toBeTruthy();
    expect(column).toHaveTextContent("You");
    expect(screen.getByTestId("identity-tag-you")).toHaveTextContent("Top");
    expect(screen.getByTestId("score-you")).toHaveAttribute("data-score", "14");
    expect(screen.getByTestId("module-history-you")).toBeInTheDocument();
    expect(screen.getByTestId("status-you")).toHaveTextContent("Thinking");
  });

  it("carries no internal scroller", () => {
    // The arena's standing rule: nothing inside it scrolls on its own.
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />);
    const column = screen.getByTestId("combatant-you");
    // `getAttribute` and not `.className`: an SVG element's className is an
    // SVGAnimatedString, and the mascot crest is SVG.
    for (const el of [column, ...column.querySelectorAll("*")]) {
      expect(el.getAttribute("class") ?? "")
        .not.toMatch(/overflow-(y|x)?-?auto|overflow-scroll/);
    }
  });
});

describe("the module-history strip", () => {
  const strip = () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />);
    return screen.getByTestId("module-history-you");
  };

  it("draws one bubble per settled module, in chronological order", () => {
    const el = strip();
    const bubbles = within(el).getAllByRole("img");
    expect(bubbles).toHaveLength(10);
    expect(bubbles.map((b) => b.getAttribute("data-base-points")))
      .toEqual(["2", "1", "0", "3", "2", "1", "2", "0", "3", "1"]);
  });

  it("flags exactly the modules the SERVER gave a speed bonus", () => {
    const el = strip();
    expect(within(el).getAllByRole("img").map((b) => b.getAttribute("data-speed-bonus")))
      .toEqual(["true", "false", "false", "true", "false",
        "false", "true", "false", "true", "false"]);
  });

  it("prints the BASE, never the base plus the bonus", () => {
    const el = strip();
    // Module 1 banked three points (2 base + 1 speed) and reads +2.
    const first = within(el).getByTestId("module-bubble-you-1");
    expect(first).toHaveTextContent("+2");
    expect(first).toHaveAccessibleName("2 base points, plus 1 speed bonus");
  });

  it("is oldest-first on BOTH sides, so the two strips compare module for module",
    () => {
      // The ledger it replaces is newest-first; a strip that inherited that
      // would still have compared correctly against itself and nonsensically
      // against the opponent's row on the end screen.
      const { container } = render(
        <>
          <CombatantPanel combatant={combatant()} presentation="banner" damage={TEN} />
          <CombatantPanel combatant={combatant({ playerId: "opp", side: "opponent" })}
            presentation="banner" damage={TEN} />
        </>);
      void container;
      const order = (id: string) => within(screen.getByTestId(`module-history-${id}`))
        .getAllByRole("img").map((b) => b.getAttribute("data-base-points"));
      expect(order("you")).toEqual(order("opp"));
      expect(order("you")[0]).toBe("2");   // module 1, not module 10
    });

  it("says so honestly when nothing has settled yet", () => {
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={[]} />);
    const el = screen.getByTestId("module-history-you");
    expect(el).toHaveTextContent("No modules yet");
    expect(within(el).queryAllByRole("img")).toHaveLength(0);
  });
});

describe("every other caller still gets the card", () => {
  it("defaults to the card, with the ledger and no banner chrome", () => {
    // The Daily Challenge, the staff duel, the arena inspector, the playtest
    // host and the match-over frame all pass nothing.
    render(<CombatantPanel combatant={combatant({ score: undefined })} damage={TEN} />);
    const column = screen.getByTestId("combatant-you");
    expect(column).toHaveAttribute("data-presentation", "card");
    expect(column.className).not.toContain("ranked-banner");
    expect(column.className).toContain("rounded-xl");
    expect(screen.getByTestId("combat-ledger-you")).toBeInTheDocument();
    expect(screen.queryByTestId("module-history-you")).toBeNull();
  });
});
