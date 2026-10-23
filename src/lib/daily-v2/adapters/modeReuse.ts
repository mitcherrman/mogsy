// ---------------------------------------------------------------------------
// Daily V2 lane D — which EXISTING renderer plays each Daily V2 slot.
//
// Daily V2 adds no mode. Every graded answer is a segment of a canonical Bot
// Ranked child match (the Daily parent never serves a question), so the
// renderer for a slot is whatever the Ranked module registry already resolves
// for that segment's `(module_id, module_version)`. This file only:
//
//   * names the (module, version) pairs a Daily V2 format may freeze, matching
//     the backend composer's supported set (lane B: quiz.v2 mcq,
//     order_forge.v2 order, mastery_slice.v2 slice child) plus the existing
//     Meta Reflex block (`item_cost_duel` v5);
//   * resolves those pairs through `getModuleRenderer` — the SAME registry
//     call the arena makes, so the result is the registry's own renderer
//     object, never a copy;
//   * refuses (null) every pair outside that set, so an admin-only playtest
//     module or an unregistered `stat_drop` can never be handed to a Daily V2
//     player by accident.
//
// Nothing here grades, times or orders anything. Readiness notes are
// documentation for lane E; the authority for "certified" is the backend.
// ---------------------------------------------------------------------------

import { getModuleRenderer, type ModuleRenderer } from "@/lib/ranked-core/modules/registry";
import type { ReviewRound, SegmentBlockView } from "@/lib/ranked-public/contracts";

export type DailyV2Mode = "quiz" | "meta_reflex" | "order_forge" | "mastery_slice" | "stat_drop";

/** Where the viewer's own per-answer result arrives on the live snapshot. */
export type LiveRevealChannel =
  /** The round's resolved envelope (shell `reveal` prop) — one question per round. */
  | "round_reveal"
  /** `segment_state.own_card_reveals` — one row per settled Meta Reflex card. */
  | "own_card_reveals"
  /** `segment_state.own_challenge_reveals` — one row per answered child/lock. */
  | "own_challenge_reveals";

export type ReuseReadiness =
  /** Module, renderer, grading and review all exist; content supply is the only gate. */
  | "reusable"
  /** Renderer exists, but no certified content fits a Daily V2 slot yet. */
  | "content_gated"
  /** No server module grades it. Must not be frozen into a format. */
  | "not_servable";

export interface DailyV2ModeBinding {
  mode: DailyV2Mode;
  /** Backend module id, or null when no backend module exists. */
  moduleId: string | null;
  moduleVersion: number | null;
  /** Live block discriminator the shared reader produces; null for a quiz round. */
  blockContract: SegmentBlockView["contract"] | null;
  revealChannel: LiveRevealChannel | null;
  /** `ReviewRound.kind` the match review reader produces for this round. */
  reviewKind: ReviewRound["kind"] | null;
  readiness: ReuseReadiness;
}

export const DAILY_V2_MODE_BINDINGS: Readonly<Record<DailyV2Mode, DailyV2ModeBinding>> = Object.freeze({
  quiz: {
    mode: "quiz", moduleId: "quiz", moduleVersion: 2,
    blockContract: null, revealChannel: "round_reveal", reviewKind: "quiz",
    readiness: "reusable",
  },
  meta_reflex: {
    mode: "meta_reflex", moduleId: "item_cost_duel", moduleVersion: 5,
    blockContract: "meta_reflex", revealChannel: "own_card_reveals", reviewKind: "meta_reflex",
    readiness: "reusable",
  },
  order_forge: {
    // Exact-order grading only. No certified range family (Farsight, Lux,
    // Ziggs...) exists; that is a content/authority gap, never a client sort.
    mode: "order_forge", moduleId: "order_forge", moduleVersion: 2,
    blockContract: "order_forge", revealChannel: "own_challenge_reveals", reviewKind: "order_forge",
    readiness: "content_gated",
  },
  mastery_slice: {
    // Renderer is child-count agnostic; whether a certified 3-child product
    // exists is a backend/owner release decision (see the reuse matrix).
    mode: "mastery_slice", moduleId: "mastery_slice", moduleVersion: 2,
    blockContract: "mastery_slice", revealChannel: "own_challenge_reveals", reviewKind: "mastery_slice",
    readiness: "content_gated",
  },
  stat_drop: {
    // The primitive exists (`StatDrop`); no server scorer does. See statDropHost.ts.
    mode: "stat_drop", moduleId: null, moduleVersion: null,
    blockContract: null, revealChannel: null, reviewKind: null,
    readiness: "not_servable",
  },
});

const key = (moduleId: string, moduleVersion: number) => `${moduleId}@${moduleVersion}`;

const SERVABLE: ReadonlyMap<string, DailyV2ModeBinding> = new Map(
  Object.values(DAILY_V2_MODE_BINDINGS)
    .filter((b) => b.readiness !== "not_servable" && b.moduleId !== null && b.moduleVersion !== null)
    .map((b) => [key(b.moduleId!, b.moduleVersion!), b]),
);

/** The binding a Daily V2 segment's `(module_id, module_version)` names, or null. */
export function dailyV2BindingFor(moduleId: string | null | undefined,
                                  moduleVersion: number | null | undefined): DailyV2ModeBinding | null {
  if (!moduleId || typeof moduleVersion !== "number") return null;
  return SERVABLE.get(key(moduleId, moduleVersion)) ?? null;
}

/**
 * The EXISTING registry renderer for a Daily V2 segment, or null when the pair
 * is not one a Daily V2 format may freeze (or the registry claims no renderer
 * for it). Null means: show the shell's neutral unsupported state.
 */
export function rendererForDailyV2Segment(moduleId: string | null | undefined,
                                          moduleVersion: number | null | undefined): ModuleRenderer | null {
  const binding = dailyV2BindingFor(moduleId, moduleVersion);
  if (!binding) return null;
  return getModuleRenderer(binding.moduleId, binding.moduleVersion!);
}
