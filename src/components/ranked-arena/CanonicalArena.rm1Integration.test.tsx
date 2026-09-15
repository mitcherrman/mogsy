/**
 * RM1 — THE WHOLE STACK, COMPOSED.
 *
 * Passes 1, 2A and 2B each have their own suites, and each proves its own
 * piece. This proves they are ONE ARENA: the real `CanonicalArena`, rendering a
 * real view model, with the banners, the module-history bubbles, the header's
 * focal display and the persistent record all mounted together.
 *
 * It is also where the "do not materially redesign" constraints are pinned.
 * The Question Stage, the Module Rail and the card presentation every
 * non-Ranked mode uses are asserted UNCHANGED here rather than being taken on
 * trust, because a header or a banner edit that quietly moved one of them
 * would otherwise only be noticed by looking.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MODULE_TITLE_MS } from "@/lib/ranked-core/centralStage";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { CanonicalArena } from "./CanonicalArena";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type {
  ArenaRail, ArenaViewModel,
} from "@/lib/ranked-core/arenaView";
import type {
  CombatantView, RoundHistoryEntry, RoundTimelineView,
} from "@/lib/ranked-core/viewTypes";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

/**
 * Let the module-name face take its turn and hand the centre back.
 *
 * A fresh arena legitimately OPENS on that face: the round it is rendering has
 * just arrived, and naming it is the first beat of the sequence. Tests that
 * want the resting clock have to let the sequence run, which is itself the
 * integration fact worth stating once here.
 */
const pastModuleTitle = () => act(() => { vi.advanceTimersByTime(MODULE_TITLE_MS + 20); });

// ───────────────────────────────────────────────────────── the match fixture

const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "you", name: "You", tag: "Top", side: "player", classId: "tank",
  roleId: "top", identityMode: "role", score: 14,
  hp: 150, maxHp: 170, xp: 0, level: 1, nextLevelThreshold: null,
  currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: null,
  hasAbilitySelected: false, ...over,
});

/** `[base, bonus]` per module, oldest first; a null base is never scored. */
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

// Ten modules each, DELIBERATELY different matches of the same length, so the
// two rows are a real comparison rather than two copies of one.
const VIEWER = history([
  [2, 1], [1, 0], [0, 0], [3, 1], [2, 0], [1, 0], [2, 1], [0, 0], [3, 1], [1, 0],
]);
const OPPONENT = history([
  [1, 0], [2, 1], [2, 0], [0, 0], [3, 1], [1, 0], [0, 0], [2, 0], [1, 0], [null, 0],
]);

/**
 * A one-node rail. The Module Rail's own model is exercised by
 * `roundTimeline.test`; all this needs to state is that the rail is MOUNTED,
 * is the shell's last child, and was not touched.
 */
const timeline: RoundTimelineView = {
  visibleNodes: 1, anchorIndex: 0, windowStart: 7,
  currentIndex: 0, currentRoundNumber: 7, anchored: true,
  nodes: [{
    roundNumber: 7, index: 0, visible: true, state: "current",
    segmentKind: null, outcome: null, tag: null, topic: null,
  }],
};

const rail = (
  which: "player" | "opponent",
  over: Partial<Extract<ArenaRail, { kind: "combatant" }>> = {},
): ArenaRail => ({
  kind: "combatant",
  combatant: which === "player" ? combatant()
    : combatant({ playerId: "opp", name: "Opponent", side: "opponent",
      roleId: "jungle", tag: "Jungle", score: 11 }),
  presentation: "banner",
  damage: which === "player" ? VIEWER : OPPONENT,
  outcome: null, damageDealt: null, feedback: null, reaction: null,
  award: null,
  ...over,
});

function arena(over: Partial<ArenaViewModel> = {}): ArenaViewModel {
  return {
    header: {
      eyebrow: "Ranked Duel · vs Bot",
      title: "Module 7 / 10",
      transitionNote: null,
      playtestNote: "Playtest · Placeholder",
      presenceNote: "Opponent connected",
      timer: { durationSeconds: 30, remainingSeconds: 8, paused: false, urgent: false },
      timerLabel: "Shared round timer",
      centralResult: null, moduleTitle: "Items", moduleEventId: 7,
    },
    roundBeat: null, segmentBeat: null, cardBeat: null,
    left: rail("player"), right: rail("opponent"),
    surface: {
      renderer: null,
      publicRound: null as never, segmentState: null, selection: null,
      permissions: NO_INTERACTIONS, actions: {} as never, skewMs: 0,
      reveal: null, onSelect: () => {}, ownsSubmission: false,
      inputOpen: true, hasContent: false,
    },
    progression: null, abilityHud: null, status: null, hudAction: null,
    timeline, revealHold: false, progressionEnabled: false,
    ...over,
  };
}

// ────────────────────────────────────────────────────────────── the assertions

describe("the arena, composed", () => {
  it("opens on the module's NAME, then hands the centre to the clock", () => {
    // The sequence, end to end through the real arena: a round arrives, the
    // display names it, and the clock — which the backend started when it
    // opened the round — takes the centre back.
    render(<CanonicalArena view={arena()} />);
    expect(screen.getByTestId("timer-display")).toHaveAttribute("data-stage", "module");
    expect(screen.getByTestId("central-module-title")).toHaveTextContent("Items");
    pastModuleTitle();
    expect(screen.getByTestId("timer-display")).toHaveAttribute("data-stage", "timer");
    expect(screen.getByTestId("timer-value")).toHaveTextContent("0:08");
  });

  it("mounts the header, both banners and the Module Rail together", () => {
    render(<CanonicalArena view={arena()} />);
    pastModuleTitle();
    expect(screen.getByTestId("ranked-header")).toBeInTheDocument();
    expect(screen.getByTestId("timer-display")).toHaveAttribute("data-stage", "timer");
    for (const id of ["you", "opp"]) {
      const column = screen.getByTestId(`combatant-${id}`);
      expect(column).toHaveAttribute("data-presentation", "banner");
      expect(column.className).toContain("ranked-banner");
      expect(screen.getByTestId(`module-history-${id}`)).toBeInTheDocument();
    }
    // The bottom region is still the timeline, and still the only thing there.
    expect(screen.getByTestId("ranked-round-timeline")).toBeInTheDocument();
  });

  it("gives the header the approved three-zone hierarchy", () => {
    render(<CanonicalArena view={arena()} />);
    pastModuleTitle();
    const header = screen.getByTestId("ranked-header");
    // Left: who, and what kind of match.
    expect(header).toHaveTextContent("Ranked Duel · vs Bot");
    expect(within(header).getByTestId("ranked-presence")).toHaveTextContent("Opponent connected");
    // Right: where in the match.
    expect(within(header).getByTestId("ranked-header-title")).toHaveTextContent("Module 7 / 10");
    // Centre: the display, and it is the only large thing in the strip.
    expect(within(header).getByTestId("timer-value")).toHaveTextContent("0:08");
    // The debug-ish note is present — connectivity/build state must stay
    // reachable — and demoted to the quietest text in the strip.
    const note = within(header).getByTestId("ranked-playtest-label");
    expect(note.className).toContain("text-[9px]");
    expect(note.className).toContain("text-muted-foreground/50");
  });

  it("keeps both players' histories comparable, module for module", () => {
    render(<CanonicalArena view={arena()} />);
    const row = (id: string) => within(screen.getByTestId(`module-history-${id}`))
      .getAllByRole("img").map((b) => [
        b.getAttribute("data-base-points"), b.getAttribute("data-speed-bonus")]);
    const you = row("you");
    const them = row("opp");
    expect(you).toHaveLength(10);
    expect(them).toHaveLength(10);
    // Index i is module i in BOTH rows — the property the end screen's two
    // stacked rows will depend on.
    expect(you[0]).toEqual(["2", "true"]);
    expect(them[0]).toEqual(["1", "false"]);
    // Every state in the approved vocabulary appears, and the unscored module
    // is neutral rather than a red zero.
    expect(you.map((b) => b[0])).toContain("0");
    expect(them[9]).toEqual(["none", "false"]);
  });
});

describe("the two result surfaces, and their two lifetimes", () => {
  const settled = () => arena({
    header: {
      ...arena().header,
      centralResult: { verdict: "CORRECT", points: "+2 POINTS" },
    },
    roundBeat: {
      settlement: {
        roundNumber: 7, endReason: "both_answered", modulePoints: null,
        players: {
          p1: { playerId: "you", outcome: "correct" },
          p2: { playerId: "opp", outcome: "incorrect" },
        },
      } as never,
      viewerSlot: "p1",
      feedback: {
        baseLabel: "CORRECT", basePoints: 2, speed: { label: "FIRST", points: 1 },
        pointsAwarded: 3, scoreAfter: 17,
      },
      pointsMatch: true,
    },
    left: rail("player", {
      outcome: "correct",
      feedback: {
        baseLabel: "CORRECT", basePoints: 2, speed: { label: "FIRST", points: 1 },
        pointsAwarded: 3, scoreAfter: 17,
      },
      award: { id: "award:you:7", basePoints: 2, speedBonusPoints: 1 },
    }),
    right: rail("opponent", {
      outcome: "incorrect",
      feedback: {
        baseLabel: "INCORRECT", basePoints: 0, speed: null,
        pointsAwarded: 0, scoreAfter: 11,
      },
      award: { id: "award:opp:7", basePoints: 0, speedBonusPoints: 0 },
    }),
  });

  it("shows the LOUD headline in the centre and the QUIET record on the right",
    () => {
      render(<CanonicalArena view={settled()} />);
      // The headline: momentary, and it owns the centre.
      expect(screen.getByTestId("timer-display")).toHaveAttribute("data-stage", "result");
      expect(screen.getByTestId("central-result-verdict")).toHaveTextContent("CORRECT");
      expect(screen.getByTestId("central-result-points")).toHaveTextContent("+2 POINTS");
      // The record: the previous-module summary, which is the surface that
      // STAYS after the beat (POINT1). Two surfaces, two lifetimes, two ids.
      expect(screen.getByTestId("ranked-last-result-verdict")).toHaveTextContent("CORRECT +2");
    });

  it("gives each column a payout layer of its own", () => {
    render(<CanonicalArena view={settled()} />);
    expect(screen.getByTestId("award-pops-you")).toBeInTheDocument();
    expect(screen.getByTestId("award-pops-opp")).toBeInTheDocument();
  });

  it("states the BASE everywhere, and the bonus only as its own mark", () => {
    render(<CanonicalArena view={settled()} />);
    // Three points were banked. Nothing on screen says "+3".
    expect(screen.getByTestId("central-result-points")).not.toHaveTextContent("+3");
    const verdict = screen.getByTestId("outcome-points-you");
    expect(verdict).toHaveTextContent("+2");
    expect(within(verdict).getByTestId("outcome-speed-you")).toHaveTextContent("+1");
  });
});

describe("the areas RM1 must not have redesigned", () => {
  it("leaves the Question Stage's footprint exactly as it was", () => {
    // The card is the canonical stage and RM1 touched none of it. Asserted on
    // the rendered class list, because that string IS the geometry contract
    // `QuestionStageGeometry` evaluates the arithmetic of.
    const view = arena();
    render(<CanonicalArena view={{
      ...view,
      surface: { ...view.surface, renderer: { Viewport: () => <div /> } as never,
        hasContent: true },
    }} />);
    const stage = screen.getByTestId("ranked-question");
    expect(stage.className).toContain("ranked-panel");
    expect(stage.className).toContain("ranked-folio");
    expect(stage.className).toContain("ranked-question-stage");
    expect(stage.className).toContain("p-3 sm:p-5 min-[1500px]:px-7");
  });

  it("leaves the Module Rail as the bottom region's only occupant", () => {
    render(<CanonicalArena view={arena()} />);
    const strip = screen.getByTestId("ranked-round-timeline");
    // Still last, still the arena's floor. Nothing RM1 added follows it.
    const shell = screen.getByTestId("ranked-match");
    expect(shell.lastElementChild).toBe(strip);
  });

  it("draws NO payout layer and NO banner for a mode that asked for neither",
    () => {
      // Every non-Ranked caller — the Daily, the staff duel, the inspector, the
      // playtest host — passes no presentation and no award.
      const view = arena();
      render(<CanonicalArena view={{
        ...view,
        left: { ...(view.left as Extract<ArenaRail, { kind: "combatant" }>),
          presentation: undefined, award: undefined },
      }} />);
      const column = screen.getByTestId("combatant-you");
      expect(column).toHaveAttribute("data-presentation", "card");
      expect(column.className).toContain("rounded-xl");
      expect(screen.queryByTestId("award-pops-you")).toBeNull();
      // ...and it keeps the ledger, not the bubble strip.
      expect(screen.getByTestId("combat-ledger-you")).toBeInTheDocument();
      expect(screen.queryByTestId("module-history-you")).toBeNull();
    });
});
