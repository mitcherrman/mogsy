/**
 * JOURNEY-UI1 — the Journey board at module level, against the fixtures.
 *
 * jsdom has no layout, so geometry ("the question never moves") is certified
 * in a real browser (see the handoff). What is provable here is the contract
 * the geometry rests on: the board is ONE mount across children, the question
 * stays mounted in its box through a beat, the beat is the server's instant
 * and nothing else, and a withheld value never reaches the DOM.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readJourneyPublicState, type JourneyPublicState } from "@/lib/journey/contract";
import {
  ARC_A_ALT_LEVEL_UP, ARC_A_CHILD_0, ARC_A_CHILD_1, ARC_A_CHILD_2, ARC_A_CHILD_3, ARC_A_CHILD_4,
  ARC_C_CHILD_0_WITHHELD, ARC_F_CHILD_1_UNLOCK, withBeat,
} from "@/lib/journey/fixtures";
import { journeyRailIdentity } from "@/lib/journey/rail";
import { JourneyModuleStage } from "./JourneyModuleStage";
import { CombatantPanel } from "@/components/ranked-arena/CombatantPanel";
import { MobileMatchBar } from "@/components/ranked-arena/MobileMatchBar";
import type { CombatantView } from "@/lib/ranked-core/viewTypes";
import type { ArenaRail } from "@/lib/ranked-core/arenaView";

const NOW = Date.parse("2026-09-25T12:00:00.000Z");
const read = (w: Record<string, unknown>, beatAt: number | null = null): JourneyPublicState =>
  readJourneyPublicState(beatAt === null ? w : withBeat(w, beatAt));

function Question({ id }: { id: string }) {
  return <div data-testid="child-question" data-child={id}><button type="button">Answer {id}</button></div>;
}
const stage = (state: JourneyPublicState, child: string, holdPrevious = false) => (
  <JourneyModuleStage state={state} holdPrevious={holdPrevious}>
    <Question key={child} id={child} />
  </JourneyModuleStage>
);
const q = (id: string) => screen.queryByTestId(id);
const isInert = () => (screen.getByTestId("journey-question") as HTMLElement & { inert?: boolean }).inert === true;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the board lives at MODULE level and persists across children", () => {
  it("one band node for the whole Journey; only the question changes", () => {
    const { rerender } = render(stage(read(ARC_A_CHILD_0), "c0"));
    const band = screen.getByTestId("scenario-hero");
    expect(band).toHaveAttribute("data-band-kind", "journey");
    rerender(stage(read(ARC_A_CHILD_1), "c1"));
    expect(screen.getByTestId("scenario-hero")).toBe(band);
    expect(screen.getByTestId("child-question")).toHaveAttribute("data-child", "c1");
    expect(screen.getByTestId("journey-step")).toHaveTextContent("Step 2 of 5");
  });

  it("draws exactly one media band: the board", () => {
    render(stage(read(ARC_A_CHILD_3), "c3"));
    expect(screen.getAllByTestId("scenario-hero")).toHaveLength(1);
    expect(screen.getAllByTestId("journey-board")).toHaveLength(1);
  });
});

describe("the transition beat is the server's, and gates the next question", () => {
  it("while the beat runs the next question is mounted, inert and veiled; at `until` it opens", () => {
    render(stage(read(ARC_A_CHILD_2, NOW), "c2"));
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "active");
    expect(isInert()).toBe(true);
    expect(screen.getByTestId("journey-question")).toHaveAttribute("data-veiled", "true");
    expect(screen.getByTestId("journey-question")).toHaveAttribute("aria-hidden", "true");
    // Still mounted — its box is held, so nothing lays out when it opens.
    expect(screen.getByTestId("child-question")).toBeInTheDocument();
    expect(within(screen.getByTestId("journey-beat")).getAllByTestId("journey-beat-line").map((l) => l.textContent))
      .toEqual(["Jarvan IV recalls · Caulfield's Warhammer", "Jarvan IV · Bonus AD 0 → 20", "Jarvan IV · AH 0 → 10"]);

    act(() => { vi.advanceTimersByTime(1799); });
    expect(isInert()).toBe(true);
    act(() => { vi.advanceTimersByTime(2); });
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "idle");
    expect(isInert()).toBe(false);
    expect(q("journey-question-veil")).toBeNull();
    expect(q("journey-beat")).toBeNull();
  });

  it("the deltas outlive the beat: they stay for the whole child", () => {
    render(stage(read(ARC_A_CHILD_4, NOW), "c4"));
    act(() => { vi.advanceTimersByTime(5_000); });
    const armor = screen.getByTestId("journey-stat-opponent-armor");
    expect(armor).toHaveAttribute("data-face", "delta");
    expect(armor).toHaveTextContent(/51\.59.*91\.59/);
    expect(screen.getByTestId("journey-item-opponent-0")).toHaveAttribute("data-new", "true");
  });

  it("a refresh after the server's instant plays no beat", () => {
    render(stage(read(ARC_A_CHILD_2, NOW - 10_000), "c2"));
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "idle");
    expect(isInert()).toBe(false);
    // …and the marks are still there.
    expect(screen.getByTestId("journey-stat-subject-ability_haste")).toHaveAttribute("data-face", "delta");
  });

  it("no server instant = no beat: the client never invents one", () => {
    render(stage(read(ARC_A_CHILD_2), "c2"));
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "idle");
    expect(isInert()).toBe(false);
  });

  it("during the previous child's reveal hold the board keeps that child's state, and the beat waits", () => {
    const { rerender } = render(stage(read(ARC_A_CHILD_1), "c1"));
    // The server has moved the viewer on; the module is still revealing c1.
    rerender(stage(read(ARC_A_CHILD_2, NOW + 3_000), "c1", true));
    expect(screen.getByTestId("journey-step")).toHaveTextContent("Step 2 of 5");
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "idle");
    expect(screen.queryByTestId("journey-item-subject-0")).not.toHaveAttribute("data-item-id");
    // The hold ends; the transition follows it (its server window is still open).
    rerender(stage(read(ARC_A_CHILD_2, NOW + 3_000), "c2"));
    expect(screen.getByTestId("journey-step")).toHaveTextContent("Step 3 of 5");
    expect(screen.getByTestId("journey-stage")).toHaveAttribute("data-beat", "active");
    expect(screen.getByTestId("journey-item-subject-0")).toHaveAttribute("data-item-id", "3133");
  });

  it("level, rank and unlock events mark the board and the beat names them", () => {
    render(stage(read(ARC_A_ALT_LEVEL_UP, NOW), "alt"));
    expect(screen.getByTestId("journey-level-subject")).toHaveAttribute("data-changed", "true");
    expect(screen.getByTestId("journey-ability-subject-Q")).toHaveAttribute("data-changed", "true");
    expect(within(screen.getByTestId("journey-pips-subject-Q")).getAllByText("", { selector: "[data-new='true']" })).toHaveLength(1);
    cleanup();
    render(stage(read(ARC_F_CHILD_1_UNLOCK, NOW), "f1"));
    expect(screen.getByTestId("journey-ability-subject-R")).toHaveAttribute("data-changed", "true");
    expect(screen.getByTestId("journey-ability-subject-R")).not.toHaveAttribute("data-locked");
    expect(within(screen.getByTestId("journey-beat")).getByText("Ultimate unlocked")).toBeInTheDocument();
  });
});

describe("answer safety in the DOM", () => {
  it("a withheld stat is `?` and its value appears nowhere on the board or in the sheet", () => {
    render(stage(read(ARC_C_CHILD_0_WITHHELD), "c0"));
    const armor = screen.getByTestId("journey-stat-opponent-armor");
    expect(armor).toHaveAttribute("data-face", "withheld");
    expect(armor).toHaveTextContent("Armor?");
    fireEvent.click(screen.getByTestId("journey-open-state"));
    expect(screen.getByTestId("journey-sheet-stat-opponent-armor")).toHaveTextContent("asked in this question");
    expect(document.body.innerHTML).not.toContain("44.195");
  });

  it("draws no cooldown and no damage — the board has nowhere to put one", () => {
    render(stage(read(ARC_A_CHILD_3), "c3"));
    const board = screen.getByTestId("journey-board");
    expect(board.textContent).not.toMatch(/cooldown|damage|seconds|\b131\b|\b8\.0\b/i);
  });
});

describe("Matchup and Combat presentation", () => {
  it("each side shows ITS OWN ranks", () => {
    render(stage(read(ARC_A_CHILD_1), "c1"));
    const ranks = (side: string) => ["Q", "W", "E", "R"]
      .map((s) => screen.getByTestId(`journey-ability-${side}-${s}`).getAttribute("data-rank")).join("");
    expect(ranks("subject")).toBe("3111");
    expect(ranks("opponent")).toBe("3021");
    expect(screen.getByTestId("journey-ability-opponent-W")).toHaveAttribute("data-locked", "true");
    expect(screen.getByTestId("journey-ability-subject-Q")).toHaveAttribute("data-focus", "true");
    expect(screen.getByTestId("journey-ability-opponent-Q")).toHaveAttribute("data-focus", "true");
    expect(screen.getByTestId("journey-seam")).toHaveAttribute("data-seam", "versus");
  });

  it("Combat highlights the attacker's ability and stats and the target's armor and item", () => {
    render(stage(read(ARC_A_CHILD_4, NOW - 10_000), "c4"));
    expect(screen.getByTestId("journey-side-subject")).toHaveAttribute("data-combat-role", "attacker");
    expect(screen.getByTestId("journey-side-opponent")).toHaveAttribute("data-combat-role", "target");
    expect(screen.getByTestId("journey-seam")).toHaveAttribute("data-seam", "combat");
    for (const id of ["journey-ability-subject-Q", "journey-stat-subject-bonus_attack_damage",
      "journey-stat-opponent-armor", "journey-item-opponent-0"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("data-focus", "true");
    }
    expect(screen.getByTestId("journey-stat-subject-ability_haste")).not.toHaveAttribute("data-focus");
  });

  it("compact keeps at most two stats per side: the asked-about first, then the changed", () => {
    render(stage(read(ARC_A_ALT_LEVEL_UP, NOW - 10_000), "alt"));
    const cells = within(screen.getByTestId("journey-side-subject")).getAllByTestId(/journey-stat-subject-/)
      .map((chip) => [chip.getAttribute("data-testid")!.replace("journey-stat-subject-", ""),
        chip.parentElement!.getAttribute("data-compact")]);
    expect(cells).toEqual([["lethality", "true"], ["bonus_attack_damage", "true"], ["ability_haste", "false"]]);
  });

  it("the State sheet shows both sides together", () => {
    render(stage(read(ARC_A_CHILD_4), "c4"));
    fireEvent.click(screen.getByTestId("journey-open-state"));
    const sheet = screen.getByTestId("journey-state-sheet");
    expect(within(sheet).getByTestId("journey-sheet-side-subject")).toHaveTextContent("Jarvan IV");
    expect(within(sheet).getByTestId("journey-sheet-side-opponent")).toHaveTextContent("Chain Vest");
    expect(within(sheet).getByTestId("journey-sheet-changes")).toHaveTextContent("Olaf · Armor 51.59 → 91.59");
  });
});

describe("the flanks carry the champion identity", () => {
  const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
    playerId: "you", name: "You", tag: "Jungle", side: "player", classId: "tank",
    roleId: "jungle", identityMode: "role", score: 14, hp: 150, maxHp: 170, xp: 0, level: 1,
    nextLevelThreshold: null, currentLevelThreshold: 0, hasSubmitted: false,
    abilityWindow: null, hasAbilitySelected: false, ...over,
  });

  it("a banner with a Journey draws the champion crest in the mascot's slot; without one, the mascot", () => {
    const state = read(ARC_A_ALT_LEVEL_UP);
    const { unmount } = render(<CombatantPanel combatant={combatant()} presentation="banner" damage={[]}
      journey={journeyRailIdentity(state, "subject")} />);
    expect(screen.getByTestId("journey-crest-subject")).toHaveAccessibleName(/Jarvan IV, level 7, Q rank 4/);
    expect(screen.getByTestId("journey-crest-level-subject")).toHaveAttribute("data-changed", "true");
    expect(q("role-crest")).toBeNull();
    unmount();
    render(<CombatantPanel combatant={combatant()} presentation="banner" damage={[]} />);
    expect(q("journey-crest-subject")).toBeNull();
    expect(screen.getByTestId("role-crest")).toBeInTheDocument();
  });

  it("the phone match bar's crest becomes the champion with a level corner", () => {
    const state = read(ARC_A_CHILD_1);
    const rail = (c: CombatantView, side: "subject" | "opponent"): Extract<ArenaRail, { kind: "combatant" }> => ({
      kind: "combatant", combatant: c, presentation: "banner", damage: [],
      outcome: null, damageDealt: null, feedback: null, reaction: null, award: null,
      journey: journeyRailIdentity(state, side),
    });
    render(<MobileMatchBar
      left={rail(combatant(), "subject")}
      right={rail(combatant({ playerId: "opp", name: "Bot", side: "opponent", roleId: "top" }), "opponent")}
      header={{ eyebrow: "", title: "Module 10 / 10", transitionNote: null, playtestNote: null,
        presenceNote: null, timer: { durationSeconds: 150, remainingSeconds: 100, paused: false, urgent: false },
        timerLabel: "", centralResult: null, moduleTitle: null, moduleEventId: null }}
      progressionEnabled={false} />);
    expect(screen.getByTestId("mobile-crest-you")).toHaveAttribute("data-journey", "true");
    expect(screen.getByTestId("mobile-crest-you")).toHaveAccessibleName("Jarvan IV, level 6");
    expect(screen.getByTestId("mobile-crest-opp-level")).toHaveTextContent("6");
  });
});

describe("source guard — the Journey layer computes nothing", () => {
  const ROOT = resolve(process.cwd(), "src");
  const files = [
    ...readdirSync(join(ROOT, "lib/journey")).map((f) => join(ROOT, "lib/journey", f)),
    ...readdirSync(join(ROOT, "components/journey")).map((f) => join(ROOT, "components/journey", f)),
  ].filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  it("imports no calculation, combat, engine or service module", () => {
    for (const f of files) {
      const imports = readFileSync(f, "utf8").split("\n").filter((l) => l.trimStart().startsWith("import"));
      for (const line of imports) {
        expect(line, f).not.toMatch(/combat-calc|combat_calculations|damage|formula|team-sim|ranked-public\/client|\/service|useRankedMatch/);
        if (line.includes("@/lib/combat-lab/")) expect(line, f).toContain("@/lib/combat-lab/abilityIcons");
      }
    }
  });
});
