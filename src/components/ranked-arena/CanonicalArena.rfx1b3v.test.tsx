/**
 * RFX1 Phase 2B3 VISUAL IMPLEMENTATION — where the closing beat lives.
 *
 * The 2B3 outro was the focus COLUMN's last child. Measured in a browser that
 * put it at `top: 708` of a 900px desktop and `top: 728` of an 853px phone —
 * below the parchment, on the unlit chamber floor, 46px tall and rendered
 * quieter than the question above it. A closing beat cannot live there, so it
 * moved to the overlay layer the medium warnings already use.
 *
 * These tests pin the SEAM rather than the styling: which layer the node is
 * rendered into, that the layer still cannot swallow a click, and that the
 * arena still learns nothing about what a duel's ending is.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CanonicalArena } from "./CanonicalArena";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { CombatantView, RoundTimelineView } from "@/lib/ranked-core/viewTypes";

afterEach(cleanup);

const combatant = (over: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "you", name: "You", tag: "Mid", side: "player", classId: "mage",
  roleId: "mid", identityMode: "role", score: 14,
  hp: 150, maxHp: 170, xp: 0, level: 1, nextLevelThreshold: null,
  currentLevelThreshold: 0, hasSubmitted: false, abilityWindow: null,
  hasAbilitySelected: false, ...over,
});

const rail = (which: "player" | "opponent"): ArenaRail => ({
  kind: "combatant",
  combatant: which === "player" ? combatant()
    : combatant({ playerId: "opp", name: "Opponent", side: "opponent",
      roleId: "top", tag: "Top", score: 11 }),
  presentation: "banner", damage: [],
  outcome: null, damageDealt: null, feedback: null, reaction: null, award: null,
});

const timeline: RoundTimelineView = {
  visibleNodes: 1, anchorIndex: 0, windowStart: 9,
  currentIndex: 0, currentRoundNumber: 9, anchored: true,
  nodes: [{
    roundNumber: 9, index: 0, visible: true, state: "current",
    segmentKind: null, outcome: null, tag: null, topic: null,
  }],
};

/** A live arena, minimal but real — the seam is what is under test. */
const view = (): ArenaViewModel => ({
  header: {
    eyebrow: "Ranked Duel", title: "Module 9 / 10", transitionNote: null,
    playtestNote: null, presenceNote: null,
    timer: { durationSeconds: 30, remainingSeconds: 8, paused: false, urgent: false },
    timerLabel: "Shared round timer",
    centralResult: null, moduleTitle: "Items", moduleEventId: 9,
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
  abilityHud: null, status: null, hudAction: null,
  timeline, revealHold: false, progressionEnabled: false,
});

const chrome = <div data-testid="probe-chrome" />;

describe("RFX1 2B3 visual — the outro uses the overlay seam", () => {
  it("renders the outro into the presentation overlay, not the focus column", () => {
    render(<CanonicalArena view={view()} chrome={chrome}
      outro={<div data-testid="probe-outro" />} />);
    const layer = screen.getByTestId("ranked-warning-layer");
    expect(layer).toContainElement(screen.getByTestId("probe-outro"));
  });

  it("keeps the layer over the whole shell and unable to eat a click", () => {
    render(<CanonicalArena view={view()} chrome={chrome}
      outro={<div data-testid="probe-outro" />} />);
    const layer = screen.getByTestId("ranked-warning-layer");
    // Input is closed by `started_at` and by the controller's phase — never
    // by this layer. A layer that took clicks would be a curtain.
    expect(layer.className).toContain("pointer-events-none");
    expect(layer.className).toContain("absolute");
    expect(layer.className).toContain("inset-0");
  });

  it("still hosts the medium warning on the same layer", () => {
    render(<CanonicalArena view={view()} chrome={chrome}
      warning={<div data-testid="probe-warning" />} />);
    expect(screen.getByTestId("ranked-warning-layer"))
      .toContainElement(screen.getByTestId("probe-warning"));
  });

  it("renders NO overlay layer at all when a mode supplies neither", () => {
    render(<CanonicalArena view={view()} chrome={chrome} />);
    expect(screen.queryByTestId("ranked-warning-layer")).toBeNull();
  });

  it("puts the ENDING last when both somehow coincide", () => {
    render(<CanonicalArena view={view()} chrome={chrome}
      warning={<div data-testid="probe-warning" />}
      outro={<div data-testid="probe-outro" />} />);
    const layer = screen.getByTestId("ranked-warning-layer");
    const ids = Array.from(layer.children).map((el) => el.getAttribute("data-testid"));
    // They are mutually exclusive by construction — a medium warning
    // announces a round about to open, and the outro only exists once the
    // match is over — but if they ever met, the ending wins.
    expect(ids).toEqual(["probe-warning", "probe-outro"]);
  });

  it("leaves the focus column byte-identical for a mode with no outro", () => {
    const { container: without } = render(
      <CanonicalArena view={view()} chrome={chrome} />);
    const { container: with_ } = render(
      <CanonicalArena view={view()} chrome={chrome}
        outro={<div data-testid="probe-outro" />} />);
    const column = (root: HTMLElement) => {
      const node = root.querySelector('[data-testid="ranked-unsupported-module"]');
      expect(node, "the focus column must have rendered").not.toBeNull();
      return node!.parentElement!.innerHTML;
    };
    // The overlay is a sibling of the shell's content, so adding an outro
    // cannot change the column's DOM — which is what kept the measured
    // document height identical with and without it.
    expect(column(with_)).toBe(column(without));
  });
});
