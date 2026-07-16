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
  platform: string;
  generator: { version: string; commit: string | null };
  completed: boolean;
};

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
    platform: typeof m.platform === "string" ? m.platform : "generic",
    generator:
      m.generator && typeof m.generator === "object"
        ? (m.generator as RunManifest["generator"])
        : { version: "unknown", commit: null },
    completed: m.completed === true,
  };
}
