/**
 * Structured run manifest (manifest.json at the run root) so tooling — the
 * Content Studio in particular — never has to infer a run's shape from
 * filenames. Pure module: build/parse only, no fs.
 *
 * Backward compatibility: older runs have no manifest. parseRunManifest
 * returns null for anything unreadable, and callers fall back to
 * summary.json / directory scanning. Never contains secrets.
 */

export const RUN_MANIFEST_VERSION = 1;

export type StudioMode =
  | "classic"
  | "single-question"
  | "answer-reveal"
  | "multi-question";

export type ManifestSlide = {
  /** 1-based order within the post/carousel this slide belongs to. */
  index: number;
  /** Semantic slide type (quiz | app-cta | recap | community | opening | summary | ending). */
  slide_kind: string;
  slug: string;
  state: string;
  format: string;
  /** Path relative to the run directory, e.g. "question_000123/mobile-social_slide-01_question.png". */
  file: string;
  /** Source question id (absent on opening/summary/ending slides). */
  question_id?: string | number;
  width?: number;
  height?: number;
  /** Difficulty tier actually rendered on this slide, if any. */
  difficulty?: string;
};

export type RunManifest = {
  schema_version: number;
  run_id: string;
  created_at: string;
  mode: StudioMode;
  /** Daily-package membership (e.g. "post-3-multi-question"), else null. */
  package_type: string | null;
  /** Package prefix shared by sibling runs, else null. */
  package_prefix: string | null;
  formats: string[];
  /** Ordered source question ids. */
  question_ids: Array<string | number>;
  /**
   * CON1 Step 3B — ordered SOURCE IDENTITY, one entry per rendered question.
   *
   * `question_ids` above is enough for a stored row: the id is durable and the
   * row can be re-read. A generated source has no such row. `mastery:ssm.base.
   * FLASH` is materialized by a code enumerator whose curriculum moves with the
   * game, so an image recorded only as "question 0" would be unattributable one
   * patch later.
   *
   * Present on every run made after this field existed, generated or not, so a
   * reader never has to infer the source kind from the shape of an id. Older
   * manifests parse as `[]`.
   */
  sources: Array<{
    id: string | number;
    review_key: string | null;
    source_kind: string;
    materialization: string | null;
    family: string | null;
    source_version: string | null;
    specimen_version: string | null;
    data_version: string | null;
  }>;
  /** Ordered question previews for display without re-fetching. */
  questions: Array<{ id: string | number; prompt_preview: string; correct_label?: string }>;
  states: string[] | null;
  difficulty_default: string | null;
  difficulty_overrides: Record<string, string>;
  slides: ManifestSlide[];
  capture_count: number;
  failure_count: number;
  warning_count: number;
  challenge: {
    question_count: number;
    repeat_variant: number | null;
    mid_cta_variant: number | null;
    summary_title: string;
  } | null;
  /** Named copy variants in effect, for reproducibility. */
  copy_variants: Record<string, string>;
  /**
   * CON1 Step 1D — true when this run was captured with the diagnostic
   * `--allow-incomplete-presentation` override, i.e. questions whose safe
   * presentation the layout system does not render were captured anyway.
   *
   * Persisted so the override is auditable from the manifest alone: a run with
   * this true is a diagnostic run, not a publishable one. Absent on runs made
   * before the flag existed, which parse as false.
   */
  allow_incomplete_presentation: boolean;
  /**
   * CON1 Step 1E — true when this run was captured with the diagnostic
   * `--allow-missing-assets` override, i.e. questions requiring an asset the
   * canonical resolver could not resolve were captured anyway.
   *
   * Recorded separately from `allow_incomplete_presentation` so the manifest
   * says WHICH class of completeness was waived. Absent on older runs, which
   * parse as false.
   */
  allow_missing_assets: boolean;
  platform: string;
  generator: { version: string; commit: string | null };
  completed: boolean;
};

/**
 * The provenance row for one rendered question.
 *
 * A stored question keeps the identity it always had (`stored_question`, no
 * review key); a generated one carries whatever the backend resolver returned,
 * verbatim. Nothing is invented here — an absent field records as null rather
 * than as a guess.
 */
export function manifestSourceEntry(q: {
  id: string | number;
  review_key?: string;
  source_kind?: string;
  provenance?: Record<string, unknown>;
}): RunManifest["sources"][number] {
  const p = q.provenance ?? {};
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    id: q.id,
    review_key: q.review_key ?? str(p.review_key),
    source_kind: q.source_kind ?? str(p.source_kind) ?? "stored_question",
    materialization: str(p.materialization) ?? (q.review_key ? null : "stored"),
    family: str(p.family),
    source_version: str(p.source_version),
    specimen_version: str(p.specimen_version),
    data_version: str(p.data_version),
  };
}

export function buildRunManifest(
  args: Omit<RunManifest, "schema_version">,
): RunManifest {
  return { schema_version: RUN_MANIFEST_VERSION, ...args };
}

/**
 * Tolerant parse: returns a RunManifest when the payload is structurally
 * usable, else null (caller falls back to legacy summary/scan). Missing
 * optional collections default to empty so older/partial manifests degrade
 * gracefully instead of crashing the runs browser.
 */
export function parseRunManifest(raw: unknown): RunManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.schema_version !== "number" || m.schema_version < 1) return null;
  if (typeof m.run_id !== "string" || !m.run_id) return null;
  if (typeof m.mode !== "string") return null;
  const slides = Array.isArray(m.slides)
    ? (m.slides as unknown[]).filter(
        (s): s is ManifestSlide =>
          !!s &&
          typeof s === "object" &&
          typeof (s as ManifestSlide).file === "string" &&
          typeof (s as ManifestSlide).slide_kind === "string",
      )
    : [];
  return {
    schema_version: m.schema_version,
    run_id: m.run_id,
    created_at: typeof m.created_at === "string" ? m.created_at : "",
    mode: m.mode as StudioMode,
    package_type: typeof m.package_type === "string" ? m.package_type : null,
    package_prefix: typeof m.package_prefix === "string" ? m.package_prefix : null,
    formats: Array.isArray(m.formats) ? (m.formats as string[]) : [],
    question_ids: Array.isArray(m.question_ids) ? (m.question_ids as Array<string | number>) : [],
    // Older manifests predate the field; absence means "not recorded", which
    // is exactly what an empty list says.
    sources: Array.isArray(m.sources) ? (m.sources as RunManifest["sources"]) : [],
    questions: Array.isArray(m.questions)
      ? (m.questions as RunManifest["questions"])
      : [],
    states: Array.isArray(m.states) ? (m.states as string[]) : null,
    difficulty_default:
      typeof m.difficulty_default === "string" ? m.difficulty_default : null,
    difficulty_overrides:
      m.difficulty_overrides && typeof m.difficulty_overrides === "object"
        ? (m.difficulty_overrides as Record<string, string>)
        : {},
    slides,
    capture_count: typeof m.capture_count === "number" ? m.capture_count : slides.length,
    failure_count: typeof m.failure_count === "number" ? m.failure_count : 0,
    warning_count: typeof m.warning_count === "number" ? m.warning_count : 0,
    challenge:
      m.challenge && typeof m.challenge === "object"
        ? (m.challenge as RunManifest["challenge"])
        : null,
    copy_variants:
      m.copy_variants && typeof m.copy_variants === "object"
        ? (m.copy_variants as Record<string, string>)
        : {},
    // Older manifests predate the flag; absence means it was not overridden.
    allow_incomplete_presentation: m.allow_incomplete_presentation === true,
    allow_missing_assets: m.allow_missing_assets === true,
    platform: typeof m.platform === "string" ? m.platform : "generic",
    generator:
      m.generator && typeof m.generator === "object"
        ? (m.generator as RunManifest["generator"])
        : { version: "unknown", commit: null },
    completed: m.completed === true,
  };
}
