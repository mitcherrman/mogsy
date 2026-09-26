/**
 * JOURNEY-UI3 — REAL backend captures (J3 `journey3/daily`).
 *
 * Every file under `__fixtures__/j3/` is a sequence of envelopes exactly as
 * the real HTTP route `GET /api/ranked/matches/{id}` returned them, captured
 * from real Bot matches on the canonical DB whose only module is the Daily's
 * own Journey module (built by the Daily recipe's spec builders), at each
 * moment of a Journey: lead-in, child open, live, reveal, transition beat,
 * next open, finish, pool exhaustion, Survival strike-out. See
 * `__fixtures__/j3/CAPTURE.md` for provenance. Nothing here is hand-written,
 * and no guard was narrowed to capture it.
 *
 * Loaded LAZILY (`import.meta.glob`), so the dev harness and the inspector pull
 * a capture only when it is looked at and no production chunk carries them.
 */
export interface CaptureSnapshot {
  label: string;
  at: string;
  envelope: Record<string, unknown>;
}

export const J3_CAPTURES = {
  voli: "voli.standard",
  zed: "zed.standard",
  olaf: "olaf.standard",
  lucian: "lucian.standard",
  pantheon: "pantheon.standard",
  "voli-survival": "voli.survival",
  "zed-survival": "zed.survival",
  "olaf-survival": "olaf.survival",
  "lucian-survival": "lucian.survival",
  "pantheon-survival": "pantheon.survival",
  strikeout: "pantheon.survival.strikeout",
  exhaust: "voli.standard.exhaust",
  // The R1-reconciled catalog (JOURNEY4 @ a273a216), same harness: `__fixtures__/j4/`.
  "j4-voli": "j4/voli.standard",
  "j4-zed": "j4/zed.standard",
  "j4-olaf": "j4/olaf.standard",
  "j4-lucian": "j4/lucian.standard",
  "j4-pantheon": "j4/pantheon.standard",
  "j4-voli-survival": "j4/voli.survival",
  "j4-zed-survival": "j4/zed.survival",
  "j4-olaf-survival": "j4/olaf.survival",
  "j4-lucian-survival": "j4/lucian.survival",
  "j4-pantheon-survival": "j4/pantheon.survival",
  "j4-strikeout": "j4/pantheon.survival.strikeout",
} as const;
export type CaptureKey = keyof typeof J3_CAPTURES;

const loaders = import.meta.glob<CaptureSnapshot[]>(["./__fixtures__/j3/*.json", "./__fixtures__/j4/*.json"], { import: "default" });

export async function loadCapture(key: CaptureKey): Promise<CaptureSnapshot[]> {
  const file = J3_CAPTURES[key];
  const load = loaders[file.startsWith("j4/") ? `./__fixtures__/${file}.json` : `./__fixtures__/j3/${file}.json`];
  if (!load) throw new Error(`no capture ${key}`);
  return load();
}
