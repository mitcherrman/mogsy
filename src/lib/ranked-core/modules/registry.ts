// ---------------------------------------------------------------------------
// Frontend Ranked module renderer registry (Phase A).
//
// Phase B slice 4 registers `item_cost_duel.v1` alongside `quiz.v1`.
//
// Resolution is by moduleId only. The backend pins module VERSION for replay
// correctness; the frontend renders whatever the backend already resolved, so
// versioning a renderer would add a second place to keep in sync without
// making anything safer. `moduleVersion` is carried for display/telemetry.
// ---------------------------------------------------------------------------

import type { SegmentMeta } from "@/lib/ranked-public/contracts";
import { ITEM_COST_DUEL_MODULE_ID, itemCostDuelModule } from "./itemCostDuelModule";
import { QUIZ_MODULE_ID, quizModule } from "./quizModule";
import type { ModuleRenderer } from "./types";

const RENDERERS: Record<string, ModuleRenderer> = {
  [QUIZ_MODULE_ID]: quizModule,
  [ITEM_COST_DUEL_MODULE_ID]: itemCostDuelModule,
};

/** Registered module ids, sorted — used by tests and diagnostics. */
export function registeredModuleIds(): string[] {
  return Object.keys(RENDERERS).sort();
}

export function getModuleRenderer(moduleId: string | null | undefined): ModuleRenderer | null {
  if (!moduleId) return quizModule; // absent discriminator => legacy quiz round
  return RENDERERS[moduleId] ?? null;
}

/**
 * Resolve the renderer for a parsed segment.
 *
 * An UNKNOWN module id returns null rather than silently falling back to the
 * quiz renderer: rendering a quiz UI for a module whose input shape differs
 * would let a player submit a meaningless answer into a real rated match. The
 * shell is responsible for showing a neutral unsupported state instead.
 */
export function rendererForSegment(segment: SegmentMeta | null | undefined): ModuleRenderer | null {
  if (!segment) return quizModule;
  return getModuleRenderer(segment.moduleId);
}

export { itemCostDuelModule, quizModule };
export type {
  ModuleRenderer, ModuleSegmentActions, ModuleViewportProps,
} from "./types";
