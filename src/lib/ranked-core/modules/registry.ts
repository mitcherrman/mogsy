// ---------------------------------------------------------------------------
// Frontend Ranked module renderer registry (Phase A).
//
// Phase A registers exactly one renderer: `quiz.v1`. No Item Cost Duel
// renderer exists yet, and a test asserts that.
//
// Resolution is by moduleId only. The backend pins module VERSION for replay
// correctness; the frontend renders whatever the backend already resolved, so
// versioning a renderer would add a second place to keep in sync without
// making anything safer. `moduleVersion` is carried for display/telemetry.
// ---------------------------------------------------------------------------

import type { SegmentMeta } from "@/lib/ranked-public/contracts";
import { QUIZ_MODULE_ID, quizModule } from "./quizModule";
import type { ModuleRenderer } from "./types";

const RENDERERS: Record<string, ModuleRenderer> = {
  [QUIZ_MODULE_ID]: quizModule,
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

export { quizModule };
export type { ModuleRenderer, ModuleViewportProps } from "./types";
