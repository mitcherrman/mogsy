// ---------------------------------------------------------------------------
// Frontend Ranked module renderer registry (Phase A).
//
// Phase B slice 4 registered `item_cost_duel.v1` alongside `quiz.v1`.
// QUIZ1 Phase 7 registers the Meta Reflex block (`item_cost_duel.v4+`) beside
// it, under the SAME module id.
//
// Resolution is by module id, then by module VERSION where an id spans more
// than one input contract. Version was deliberately ignored before, when every
// id had exactly one renderer — and that stopped being safe the moment
// `item_cost_duel` forked: v1–v3 render item pairs and answer with an
// `item_id`, v4 renders mixed Meta Reflex cards and answers with a positional
// `card_id`. Resolving those to the same renderer would put a card on screen
// whose click submits an answer the server refuses.
//
// A module whose contract has never forked declares no version rule and serves
// every version, which is exactly the historical behaviour.
// ---------------------------------------------------------------------------

import type { SegmentMeta } from "@/lib/ranked-public/contracts";
import { ITEM_COST_DUEL_MODULE_ID, itemCostDuelModule } from "./itemCostDuelModule";
import { metaReflexModule } from "./metaReflexModule";
import { QUIZ_MODULE_ID, quizModule } from "./quizModule";
import type { ModuleRenderer } from "./types";

/** Ordered candidates per module id; the first version match wins. */
const RENDERERS: Record<string, readonly ModuleRenderer[]> = {
  [QUIZ_MODULE_ID]: [quizModule],
  [ITEM_COST_DUEL_MODULE_ID]: [metaReflexModule, itemCostDuelModule],
};

/** Registered module ids, sorted — used by tests and diagnostics. */
export function registeredModuleIds(): string[] {
  return Object.keys(RENDERERS).sort();
}

const serves = (renderer: ModuleRenderer, version: number): boolean =>
  renderer.servesVersion ? renderer.servesVersion(version) : true;

export function getModuleRenderer(moduleId: string | null | undefined,
                                  moduleVersion = 1): ModuleRenderer | null {
  if (!moduleId) return quizModule; // absent discriminator => legacy quiz round
  const candidates = RENDERERS[moduleId];
  if (!candidates) return null;
  return candidates.find((r) => serves(r, moduleVersion)) ?? null;
}

/**
 * Resolve the renderer for a parsed segment.
 *
 * An unknown module id — or a known id at a version no registered renderer
 * claims — returns null rather than falling back to the quiz renderer or to
 * the newest renderer for that id. Rendering a UI whose input shape differs
 * from the segment's would let a player submit a meaningless answer into a real
 * rated match. The shell shows a neutral unsupported state instead.
 */
export function rendererForSegment(segment: SegmentMeta | null | undefined): ModuleRenderer | null {
  if (!segment) return quizModule;
  return getModuleRenderer(segment.moduleId, segment.moduleVersion);
}

export { itemCostDuelModule, metaReflexModule, quizModule };
export type {
  ModuleRenderer, ModuleSegmentActions, ModuleViewportProps,
} from "./types";
