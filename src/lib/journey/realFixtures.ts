/**
 * JOURNEY-UI2 — REAL backend captures (J2 `journey2/core` @ 52e9d929).
 *
 * Every file under `__fixtures__/j2/` is a sequence of envelopes exactly as
 * `GET /matches/{id}/public` composes them (`project_public` +
 * `segment_state_for` + `ruleset_state_for`), captured from real Bot matches
 * on the canonical DB at each moment of a Journey: child open, reveal,
 * transition beat, next child open, finish, Survival stop. See
 * `__fixtures__/j2/CAPTURE.md` for provenance and the one guard narrowing the
 * capture needed. Nothing here is hand-written.
 *
 * Loaded LAZILY (`import.meta.glob`), so the dev harness and the inspector pull
 * a capture only when it is looked at and no production chunk carries them.
 */
export interface CaptureSnapshot {
  label: string;
  at: string;
  envelope: Record<string, unknown>;
}

export const J2_CAPTURES = {
  olaf: "olaf.standard.v2",
  volibear: "volibear.standard.v2",
  zed: "zed.standard.v2",
  lucian: "lucian.standard.v2",
  senna: "senna.standard.v2",
  ahri: "ahri.standard.v2",
  survival: "volibear.survival.stop",
  block: "olaf.standard.block",
} as const;
export type CaptureKey = keyof typeof J2_CAPTURES;

const loaders = import.meta.glob<CaptureSnapshot[]>("./__fixtures__/j2/*.json", { import: "default" });

export async function loadCapture(key: CaptureKey): Promise<CaptureSnapshot[]> {
  const load = loaders[`./__fixtures__/j2/${J2_CAPTURES[key]}.json`];
  if (!load) throw new Error(`no capture ${key}`);
  return load();
}
