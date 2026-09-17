/**
 * RMOB2 — the phone match bar draws both duelists, the clock and the module
 * position from the SAME view the desktop header and banners read.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ArenaHeaderView } from "@/lib/ranked-core/arenaView";
import type { CombatantView, RoundHistoryEntry } from "@/lib/ranked-core/viewTypes";
import { MOBILE_RECENT_RESULTS, MobileMatchBar } from "./MobileMatchBar";

afterEach(cleanup);

const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "userA", name: "Kalista_Enjoyer", side: "player", classId: "tank",
  roleId: "mid", identityMode: "role", hp: 170, maxHp: 170, xp: 0, level: 1,
  nextLevelThreshold: null, currentLevelThreshold: null, score: 7,
  hasSubmitted: false, abilityWindow: null, hasAbilitySelected: false,
  ...over,
});

const history = (n: number): RoundHistoryEntry[] => Array.from({ length: n }, (_, i) => ({
  roundNumber: i + 1, outcome: i % 2 ? "incorrect" : "correct",
  basePoints: i % 2 ? 0 : 2, speedBonusPoints: 0,
} as RoundHistoryEntry));

const rail = (c: CombatantView, damage: RoundHistoryEntry[] = history(3)) => ({
  kind: "combatant" as const, combatant: c, damage, outcome: null, damageDealt: null,
  presentation: "banner" as const, reaction: null,
});

const header = (over: Partial<ArenaHeaderView> = {}): ArenaHeaderView => ({
  eyebrow: "Ranked Duel", title: "4 / 10", transitionNote: null, playtestNote: null,
  presenceNote: null, timerLabel: "Round timer",
  timer: { durationSeconds: 30, remainingSeconds: 24, paused: false, urgent: false },
  ...over,
});

const mount = (h = header()) => render(
  <MobileMatchBar header={h} progressionEnabled={false}
    left={rail(combatant())}
    right={rail(combatant({ playerId: "userB", name: "Opponent", side: "opponent",
      roleId: "support", score: 5, hasSubmitted: true }))} />);

describe("MobileMatchBar", () => {
  it("names both players and shows both scores and statuses", () => {
    mount();
    expect(screen.getByTestId("mobile-name-userA")).toHaveTextContent("Kalista_Enjoyer");
    expect(screen.getByTestId("mobile-name-userB")).toHaveTextContent("Opponent");
    expect(screen.getByTestId("mobile-score-userA")).toHaveTextContent("7");
    expect(screen.getByTestId("mobile-score-userB")).toHaveTextContent("5");
    expect(screen.getByTestId("mobile-status-userA")).toHaveTextContent("Thinking…");
    expect(screen.getByTestId("mobile-status-userB")).toHaveTextContent("Locked in");
  });

  it("puts the role icon beside each name", () => {
    mount();
    const nameRow = screen.getByTestId("mobile-name-userA").parentElement!;
    expect(within(nameRow).getByTestId("role-emblem")).toHaveAttribute("data-role", "mid");
  });

  it("shows exactly the two most recent settled modules per player", () => {
    mount();
    expect(MOBILE_RECENT_RESULTS).toBe(2);
    const recent = within(screen.getByTestId("mobile-recent-userA"))
      .getAllByTestId(/mobile-recent-bubble-userA-/);
    expect(recent.map((b) => b.getAttribute("data-testid")))
      .toEqual(["mobile-recent-bubble-userA-3", "mobile-recent-bubble-userA-2"]);
  });

  it("draws the clock and the module position in the centre", () => {
    mount();
    expect(screen.getByTestId("mobile-timer-value")).toHaveTextContent("0:24");
    expect(screen.getByTestId("mobile-module-position")).toHaveTextContent("4 / 10");
  });

  it("marks an urgent clock the way the desktop timer does", () => {
    mount(header({ timer: { durationSeconds: 30, remainingSeconds: 4, paused: false, urgent: true } }));
    expect(screen.getByTestId("mobile-timer-value")).toHaveAttribute("data-timer-state", "urgent");
  });
});
