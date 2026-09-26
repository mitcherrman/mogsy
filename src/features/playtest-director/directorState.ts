/**
 * PLAY1 — the authoritative director state, as the browser holds it.
 *
 * `playtest_director_state` is the authority. Realtime events and polls are
 * both just deliveries of that row, and they can arrive late, twice, or out of
 * order. `revision` makes that harmless: a delivery replaces what we hold only
 * if it is strictly newer (or we hold nothing). Nothing else is merged.
 */
import type { DirectorPosition } from "./manifest";

export interface DirectorState extends DirectorPosition {
  cohortId: string;
  revision: number;
  updatedAt: string | null;
}

export function applyDirectorState(current: DirectorState | null, incoming: DirectorState | null): DirectorState | null {
  if (!incoming) return current;
  if (current && current.cohortId !== incoming.cohortId) return current;
  if (current && incoming.revision <= current.revision) return current;
  return incoming;
}

/** Wire row → state. Tolerates bigint-as-string revisions from PostgREST. */
export function readDirectorRow(row: unknown): DirectorState | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const revision = Number(r.revision);
  const buildStep = Number(r.build_step);
  if (typeof r.cohort_id !== "string" || typeof r.scene_id !== "string") return null;
  if (!Number.isFinite(revision) || !Number.isFinite(buildStep)) return null;
  return {
    cohortId: r.cohort_id,
    sceneId: r.scene_id,
    buildStep,
    revision,
    updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}
