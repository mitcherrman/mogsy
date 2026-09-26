/**
 * PLAY1 — thin wrappers over canonical `track()`. The emitter already stamps
 * visitor/session/interaction context; these add only bounded playtest keys.
 */
import { track } from "@/lib/analytics";

export interface PlaytestContext {
  cohortId: string;
  enrollmentId: string;
  manifestId: string;
  manifestVersion: number;
}

export type PlaytestEventName =
  | "playtest_joined"
  | "playtest_scene_viewed"
  | "playtest_gameplay_released"
  | "playtest_stage_checkpoint_reached"
  | "playtest_feedback_submitted"
  | "playtest_completed";

export function trackPlaytest(
  name: PlaytestEventName,
  ctx: PlaytestContext,
  extra: { sceneId?: string; buildStep?: number; resumed?: boolean } = {},
): void {
  track(name, {
    metadata: {
      cohort_id: ctx.cohortId,
      enrollment_id: ctx.enrollmentId,
      manifest_id: ctx.manifestId,
      manifest_version: ctx.manifestVersion,
      ...(extra.sceneId !== undefined ? { scene_id: extra.sceneId } : {}),
      ...(extra.buildStep !== undefined ? { build_step: extra.buildStep } : {}),
      ...(extra.resumed !== undefined ? { resumed: extra.resumed } : {}),
    },
  });
}
