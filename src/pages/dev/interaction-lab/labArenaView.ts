/**
 * MIG1.1 — project the Lab's local state into the arena's real input
 * contract (`ArenaViewModel`), the way `journeyArenaView` does for the Journey
 * harness. Nothing here is a second arena: every field is one the production
 * `CanonicalArena` already reads, and every Ranked-only layer (timer, rails'
 * duelists, abilities, timeline, report) is simply absent.
 */
import type { ReactNode } from "react";
import type { ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { RankedResultFeedback } from "@/lib/ranked-core/flow/rankedFlow";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
import type { SegmentChoice } from "@/lib/ranked-public/client";
import type { ModuleRenderer } from "@/lib/ranked-core/modules/types";
import { NO_INTERACTIONS, type InteractionPermissions } from "@/lib/ranked-core/viewTypes";
import type { InteractionPhase } from "@/lib/interaction-grammar/types";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: false,
  canReviewSubmission: false, canConfirmSubmission: true, canAdvance: false,
};

/**
 * The arena requires a `publicRound` for the surface. The Lab has no match, so
 * this is an explicit, inert placeholder: no question, no segment state, no
 * players. The lab viewports never read it, and `report` is null, so the arena
 * never snapshots it either.
 */
export const LAB_PUBLIC_ROUND = Object.freeze({
  schemaVersion: "mig_lab.v1", serverTime: "1970-01-01T00:00:00Z", matchId: "mig-lab",
  matchStatus: "lab", matchOver: false, winnerId: null, completionReason: null,
  completedRounds: 0, players: [], activeRound: null, nextRoundDurationSeconds: 0,
  question: null, segment: { moduleId: "mig_lab", moduleVersion: 1 },
  segmentState: null, scoring: null, presence: null,
}) as unknown as PublicRoundView;

export function labArenaView(args: {
  title: string;
  renderer: ModuleRenderer;
  phase: InteractionPhase;
  selection: unknown;
  reveal: SurfaceReveal | null;
  /** The lab-scoped verdict for the card overlay, or null (Stat Drop has none). */
  verdict: "correct" | "incorrect" | null;
  /** Bumps per reveal so the overlay replays once per reveal, never per render. */
  revealId: number;
  onSelect: (selection: unknown) => void;
  onSubmit: (choice: SegmentChoice) => void;
  left: ReactNode;
  right: ReactNode;
}): ArenaViewModel {
  const open = args.phase === "open";
  const resultFeedback: RankedResultFeedback | null = args.phase === "revealed" && args.verdict
    ? { viewer: { kind: "round", id: `mig-lab:reveal:${args.revealId}`, verdict: args.verdict }, opponent: null }
    : null;
  return {
    report: null,
    header: {
      eyebrow: "Interaction Lab", title: args.title, transitionNote: null,
      playtestNote: "Dev fixture · not recorded", presenceNote: null,
      timer: null, timerLabel: "", centralResult: null, moduleTitle: null, moduleEventId: null,
    },
    roundBeat: null, segmentBeat: null, cardBeat: null,
    left: { kind: "panel", node: args.left },
    right: { kind: "panel", node: args.right },
    surface: {
      renderer: args.renderer,
      publicRound: LAB_PUBLIC_ROUND,
      segmentState: null,
      selection: args.selection,
      permissions: open ? OPEN : NO_INTERACTIONS,
      actions: { submitChallenge: (_i, choice) => args.onSubmit(choice), busy: false, error: null },
      skewMs: 0,
      reveal: args.reveal,
      onSelect: args.onSelect,
      ownsSubmission: true,
      inputOpen: open,
      hasContent: true,
    },
    abilityHud: null, status: null, hudAction: null, timeline: null,
    revealHold: false, progressionEnabled: false,
    resultFeedback,
  };
}
