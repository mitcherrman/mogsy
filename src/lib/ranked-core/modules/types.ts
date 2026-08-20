// ---------------------------------------------------------------------------
// Ranked module renderer contract (Phase A).
//
// Vocabulary matches the backend: a MATCH contains SEGMENTS; a segment contains
// one or more CHALLENGES; a MODULE renders a segment. Today's Ranked question
// is a `quiz` segment with exactly one challenge.
//
// Ownership split (the reason this seam exists):
//   * The persistent Ranked SHELL owns combatant panels, HP, level/XP,
//     abilities, timer, connection state, segment status, damage transition,
//     level-up, and result. None of that is a module concern.
//   * A MODULE owns only what is inside the segment viewport: the prompt, the
//     input, the review summary, and its own reveal content.
//
// Deliberately NOT a mode-flag system: components receive data and permissions,
// never `isQuiz` / `isItemCostDuel` branches. Shared arena components are not
// forked and are not modified by this contract.
// ---------------------------------------------------------------------------

import type { ComponentType } from "react";
import type {
  InteractionPermissions,
  QuestionView,
} from "@/lib/ranked-core/viewTypes";
import type { SegmentChoice } from "@/lib/ranked-public/client";
import type { SurfaceReveal } from "@/lib/question-surface/contract";
import type { PublicRoundView, SegmentStateView } from "@/lib/ranked-public/contracts";

/**
 * Authoritative segment actions the shell lends to a module viewport.
 *
 * Every one of these is a server round trip. A module NEVER advances its own
 * index, decides correctness, or measures timing — it asks, and re-renders
 * from whatever the next authoritative snapshot says.
 */
export interface ModuleSegmentActions {
  /**
   * Answer the challenge at `challengeIndex`. WHICH token the answer names is
   * the card contract's business — a v4 Meta Reflex card answers with its
   * server-issued positional `cardId`, a v1–v3 item card with its `itemId` —
   * so the shell relays a typed choice rather than a bare string it would have
   * to interpret.
   */
  submitChallenge: (challengeIndex: number, choice: SegmentChoice) => void;
  /** True while a challenge submission is in flight. */
  busy: boolean;
  /** Last action error, already human-readable. */
  error: string | null;
}

/** Props every module viewport receives from the shell. */
export interface ModuleViewportProps {
  /** The active segment's public data, already parsed and reveal-safe. */
  publicRound: PublicRoundView;
  /** The viewer's current in-progress selection, module-defined. */
  selection: unknown;
  /** Externally supplied gating; a viewport must never widen it. */
  permissions: InteractionPermissions;
  /** Report a selection change back to the shell controller. */
  onSelect: (selection: unknown) => void;
  /**
   * Owner state of a multi-challenge segment; null for a one-challenge
   * module. Present on both the public and private snapshots, so a module can
   * drive its whole phase model from the ordinary poll.
   */
  segmentState: SegmentStateView | null;
  /** Server round trips. Only a module that declares `ownsSubmission` uses these. */
  actions: ModuleSegmentActions;
  /** Deadline-anchored clock skew, so a countdown uses server time. */
  skewMs: number;
  /**
   * QUIZ1 Phase 11 — backend-authoritative reveal for the CURRENTLY RENDERED
   * round, or null.
   *
   * Null pre-reveal, always. The shell derives it from the resolved projection
   * and only for the round the surface is actually showing, so a settlement
   * can never resolve the tablets of the question that came after it. A module
   * that owns its own reveal (Meta Reflex) ignores this.
   */
  reveal?: SurfaceReveal | null;
}

/**
 * What a module contributes. Phase A keeps the surface minimal: only the
 * members the shell actually consumes today are defined, so nothing here is
 * speculative or untested.
 */
export interface ModuleRenderer {
  moduleId: string;
  moduleVersion: number;
  /**
   * Which module VERSIONS this renderer may serve, when its module id spans
   * more than one input contract.
   *
   * `item_cost_duel` is the case that needs it: v1–v3 show five item-cost
   * pairs and answer with an `item_id`, v4 shows five mixed Meta Reflex cards
   * and answers with a positional `card_id`. The id is shared because every
   * historical row already stores it, so the VERSION is the only honest
   * discriminator — and matching on it explicitly is what stops a v4 segment
   * being handed to a renderer that would submit an answer the server refuses.
   *
   * Omitted means "any version", which is the historical behaviour and stays
   * correct for a module whose input contract has never forked.
   */
  servesVersion?: (moduleVersion: number) => boolean;
  /**
   * True when the module owns its own input and submission, so the shell must
   * NOT render the quiz answer flow or the quiz ability tray alongside it.
   *
   * This is a capability the module declares, not an `isItemCostDuel` flag in
   * the shell: adding a third module changes only that module's value.
   */
  ownsSubmission: boolean;
  /** The segment viewport rendered inside the arena's centre column. */
  Viewport: ComponentType<ModuleViewportProps>;
  /**
   * Project the segment's question-shaped view, when the module has one.
   * `quiz` returns today's `QuestionView`; a non-question module returns null
   * and drives its viewport from `publicRound` directly.
   */
  projectQuestion: (pub: PublicRoundView) => QuestionView | null;
  /** Short human summary of the pending selection, for the review panel. */
  summaryLabel: (pub: PublicRoundView, selection: unknown) => string | null;
}
