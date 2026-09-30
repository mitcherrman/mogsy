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
  // K2 — the K1 knowledge-object contract (backend 597a2432), same harness: `__fixtures__/k1/`.
  "k1-voli": "k1/voli.standard",
  "k1-pantheon": "k1/pantheon.standard",
  "k1-ahri-survival": "k1/ahri.survival",
  "k1-voli-survival": "k1/voli.survival",
  "k1-voli-timeout": "k1/voli.standard.timeout",
  // JOURNEY-MOTION-V1 — the semantic beat policy (900 / 1300 ms) + the reveal
  // that ends at its own window, with reads at each beat's first, middle and
  // last millisecond: `__fixtures__/m1/`.
  "m1-voli": "m1/voli.standard",
  "m1-pantheon": "m1/pantheon.standard",
  "m1-ahri-survival": "m1/ahri.survival",
  "m1-voli-survival": "m1/voli.survival",
  // JP2 — the admin Zed/Ahri REFERENCE Journey (preset
  // `admin.zed_ahri_reference_journey`, backend fe942a58), same harness with
  // the preset instead of a Daily format: `__fixtures__/jref/`.
  "jref-zed-ahri": "jref/zed_ahri.reference",
  "jref-zed-ahri-wrong": "jref/zed_ahri.reference.wrong",
  "jref-zed-ahri-timeout": "jref/zed_ahri.reference.timeout",
  // JP5 — the same two harnesses on the JP5 backend (typed workings + per-child
  // reveal windows, `jp5/journey-structured-working`): `__fixtures__/jp5/`.
  "jp5-ref-zed-ahri": "jp5/zed_ahri.reference",
  "jp5-ref-zed-ahri-wrong": "jp5/zed_ahri.reference.wrong",
  "jp5-ref-zed-ahri-timeout": "jp5/zed_ahri.reference.timeout",
  "jp5-voli": "jp5/voli.standard",
  "jp5-pantheon": "jp5/pantheon.standard",
  "jp5-voli-survival": "jp5/voli.survival",
  "jp5-ahri-survival": "jp5/ahri.survival",
} as const;
export type CaptureKey = keyof typeof J3_CAPTURES;

const loaders = import.meta.glob<CaptureSnapshot[]>(
  ["./__fixtures__/j3/*.json", "./__fixtures__/j4/*.json", "./__fixtures__/k1/*.json", "./__fixtures__/m1/*.json",
    "./__fixtures__/jref/*.json", "./__fixtures__/jp5/*.json"], { import: "default" });

export async function loadCapture(key: CaptureKey): Promise<CaptureSnapshot[]> {
  const file = J3_CAPTURES[key];
  const load = loaders[/^(j4|k1|m1|jref|jp5)\//.test(file) ? `./__fixtures__/${file}.json` : `./__fixtures__/j3/${file}.json`];
  if (!load) throw new Error(`no capture ${key}`);
  return load();
}
