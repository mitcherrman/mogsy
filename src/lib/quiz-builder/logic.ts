/**
 * Pure helpers for the Pro Esports Quiz Builder admin page. No React, no
 * network — validation, payload construction, coverage gating, and error
 * message mapping live here so they can be unit-tested and shared between the
 * candidate editor and the draft editor.
 *
 * Backend remains authoritative for coverage and answer integrity; these
 * checks are a client-side pre-flight to give fast inline feedback and to
 * avoid obviously-invalid POST/PATCH requests.
 */
import type {
  QuizBuilderCandidate,
  QuizBuilderCoverageStatus,
  QuizBuilderDraftCreate,
  QuizBuilderMeta,
} from "@/lib/quiz/api";
import {
  isProChampionSection,
  isSupportedScope,
  isValidChampionSlug,
  normalizeScopeName,
  parseProDataSource,
  proDataSourceUrl,
  PRO_CHAMPION_SECTIONS,
  type ProChampionSection,
} from "@/lib/league-docs/pro-data-links";

/**
 * Raw form inputs for the optional League Docs Pro Data source. Kept as
 * strings so the editor can show per-field validation; assembled into the
 * canonical snake_case metadata only at save time (validateProSource).
 */
export type EditableProSource = {
  enabled: boolean;
  championSlug: string;
  year: string;
  scope: "" | "all-imported" | "major" | "international";
  section: "" | ProChampionSection;
};

export type EditableQuestion = {
  question_text: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: number;
  proSource: EditableProSource;
};

export const EMPTY_PRO_SOURCE: EditableProSource = {
  enabled: false,
  championSlug: "",
  year: "",
  scope: "",
  section: "",
};

export const PRO_SOURCE_SECTION_OPTIONS: { value: ProChampionSection; label: string }[] =
  PRO_CHAMPION_SECTIONS.map((value) => ({
    value,
    label: value
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
  }));

export const PRO_SOURCE_SCOPE_OPTIONS: { value: "all-imported" | "major" | "international"; label: string }[] = [
  { value: "all-imported", label: "All imported" },
  { value: "major", label: "Major leagues" },
  { value: "international", label: "International" },
];

/**
 * Hydrate the editor's source sub-state from a stored draft's pro_data_source
 * (snake_case, or null). `invalid` is true when a value is present but does
 * not pass the shared parser — the editor warns and requires correction
 * rather than silently overwriting or widening it.
 */
export function proSourceFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): { edit: EditableProSource; invalid: boolean } {
  if (!meta || typeof meta !== "object") return { edit: { ...EMPTY_PRO_SOURCE }, invalid: false };
  const obj = meta as Record<string, unknown>;
  const rawSlug = typeof obj.champion_slug === "string" ? obj.champion_slug : "";
  const rawYear = obj.year === undefined || obj.year === null ? "" : String(obj.year);
  const normScope = normalizeScopeName(typeof obj.scope === "string" ? obj.scope : null);
  const scope = normScope && isSupportedScope(normScope) ? (normScope as EditableProSource["scope"]) : "";
  const section =
    typeof obj.section === "string" && isProChampionSection(obj.section) ? obj.section : "";
  const edit: EditableProSource = {
    enabled: true,
    championSlug: rawSlug,
    year: rawYear,
    scope,
    section,
  };
  return { edit, invalid: parseProDataSource(obj) === null };
}

export type ProSourceResult =
  | { ok: true; metadata: Record<string, unknown> | null }
  | { ok: false; errors: string[] };

/**
 * Validate the source sub-state and produce canonical snake_case metadata
 * (or null when disabled). Fails closed: any supplied-but-invalid field is an
 * error, and parseProDataSource is the final gate so the builder never emits
 * metadata the public quiz would reject.
 */
export function validateProSource(edit: EditableProSource): ProSourceResult {
  if (!edit.enabled) return { ok: true, metadata: null };

  const errors: string[] = [];
  const slug = edit.championSlug.trim();
  if (!slug) errors.push("Champion slug is required.");
  else if (!isValidChampionSlug(slug)) errors.push("Champion slug is not a valid slug.");

  const source: Record<string, unknown> = { champion_slug: slug };

  const yearText = edit.year.trim();
  if (yearText) {
    const year = Number(yearText);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      errors.push("Year must be a whole number from 2000 to 2100.");
    } else {
      source.year = year;
    }
  }

  if (edit.scope) {
    if (!isSupportedScope(edit.scope)) errors.push("Scope is not supported.");
    else source.scope = edit.scope;
  }

  if (edit.section) {
    if (!isProChampionSection(edit.section)) errors.push("Section is not valid.");
    else source.section = edit.section;
  }

  if (errors.length) return { ok: false, errors };

  // Final gate: the shared parser must accept the assembled object.
  if (parseProDataSource(source) === null) {
    return { ok: false, errors: ["Pro Data source metadata is invalid."] };
  }
  return { ok: true, metadata: source };
}

/** Destination preview URL for the current source sub-state, or null if invalid/disabled. */
export function proSourcePreviewUrl(edit: EditableProSource): string | null {
  const result = validateProSource(edit);
  if (!result.ok || !result.metadata) return null;
  const parsed = parseProDataSource(result.metadata);
  return parsed ? proDataSourceUrl(parsed) : null;
}

export type AnswerValidation = {
  ok: boolean;
  errors: string[];
};

/**
 * Validate an editable question the same way the backend does before a
 * save/patch: non-empty text, 2+ non-blank choices, unique after
 * trim+lowercase, and the correct answer present exactly once.
 */
export function validateEditableQuestion(q: EditableQuestion): AnswerValidation {
  const errors: string[] = [];

  if (!q.question_text.trim()) errors.push("Question text is required.");

  const trimmed = q.choices.map((c) => c.trim());
  if (trimmed.some((c) => !c)) errors.push("Choices cannot be blank.");

  const nonBlank = trimmed.filter(Boolean);
  if (nonBlank.length < 2) errors.push("At least two choices are required.");

  const normalized = nonBlank.map((c) => c.toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    errors.push("Choices must be unique.");
  }

  const correct = q.correctAnswer.trim().toLowerCase();
  if (!correct) {
    errors.push("A correct answer must be selected.");
  } else {
    const matches = normalized.filter((c) => c === correct).length;
    if (matches === 0) errors.push("Correct answer must be one of the choices.");
    if (matches > 1) errors.push("Correct answer matches more than one choice.");
  }

  if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) {
    errors.push("Difficulty must be between 1 and 5.");
  }

  const proSource = validateProSource(q.proSource);
  if (!proSource.ok) errors.push(...proSource.errors);

  return { ok: errors.length === 0, errors };
}

/** Seed an editable question from a generated candidate (no source metadata yet). */
export function candidateToEditable(c: QuizBuilderCandidate): EditableQuestion {
  return {
    question_text: c.question_text,
    choices: [...c.choices],
    correctAnswer: c.correct_answer.value,
    explanation: c.explanation ?? "",
    difficulty: c.difficulty,
    proSource: { ...EMPTY_PRO_SOURCE },
  };
}

/**
 * Build the POST /drafts body from a candidate plus (possibly edited) fields.
 * Preserves the evidence/generation snapshot and coverage_status from the
 * original candidate — the backend re-validates coverage regardless.
 */
export function buildDraftCreatePayload(
  candidate: QuizBuilderCandidate,
  edited: EditableQuestion,
): QuizBuilderDraftCreate {
  const proSource = validateProSource(edited.proSource);
  const payload: QuizBuilderDraftCreate = {
    source_type: candidate.source_type,
    template_id: candidate.template_id,
    year: candidate.year,
    scope_name: candidate.scope_name,
    question_text: edited.question_text.trim(),
    question_format: candidate.format,
    choices: edited.choices.map((c) => c.trim()),
    correct_answer: { type: candidate.correct_answer.type, value: edited.correctAnswer.trim() },
    explanation: edited.explanation.trim() || null,
    evidence: candidate.evidence,
    generation_params: candidate.generation_params,
    source_tables: candidate.source_tables,
    difficulty: edited.difficulty,
    coverage_status: candidate.coverage_status,
  };
  // Only attach when valid + enabled; validation blocks save otherwise.
  if (proSource.ok && proSource.metadata) payload.pro_data_source = proSource.metadata;
  return payload;
}

/**
 * Build the PATCH body for an existing draft's source metadata. Returns the
 * key to include: an object to set/replace, or explicit null to clear (only
 * when it was previously set), or {} to omit when nothing changed.
 */
export function buildProSourceUpdate(
  edited: EditableProSource,
  hadSource: boolean,
): { pro_data_source?: Record<string, unknown> | null } {
  const result = validateProSource(edited);
  if (result.ok && result.metadata) return { pro_data_source: result.metadata };
  // Disabled/empty: clear it server-side only if the draft previously had one.
  if (result.ok && hadSource) return { pro_data_source: null };
  return {};
}

export const COVERAGE_META: Record<
  QuizBuilderCoverageStatus,
  { label: string; tone: "ok" | "warn" | "muted" }
> = {
  complete: { label: "Complete data", tone: "ok" },
  partial: { label: "Partial data", tone: "warn" },
  in_progress: { label: "Import in progress", tone: "warn" },
  unavailable: { label: "No data", tone: "muted" },
  unknown: { label: "Coverage unknown", tone: "muted" },
};

/** Production-ready means the backend will accept send-to-review. */
export function isProductionReady(status: QuizBuilderCoverageStatus): boolean {
  return status === "complete";
}

export const INCOMPLETE_SEND_REASON =
  "Send to reviewer is disabled: coverage is not complete. This candidate may " +
  "be saved as a draft, but incomplete/historical data cannot be promoted.";

/** Sensible generate-form defaults derived from backend metadata. */
export function pickGenerateDefaults(meta: QuizBuilderMeta): {
  year: number | null;
  scope_name: string | null;
  template_id: string | null;
  candidate_count: number;
  difficulty: number;
} {
  // Prefer a complete + production-ready year (e.g. 2026), else newest.
  const ready = meta.years.filter((y) => y.production_ready);
  const yearMeta = (ready[0] ?? meta.years[0]) ?? null;
  const year = yearMeta?.year ?? null;

  // Prefer "major" if the chosen year offers it, else its first scope.
  const yearScopes = yearMeta?.scopes ?? meta.scopes.map((s) => s.scope_name);
  const scope_name = yearScopes.includes("major") ? "major" : (yearScopes[0] ?? null);

  const template_id = meta.templates[0]?.template_id ?? null;
  const difficulty = meta.templates[0]?.default_difficulty ?? 2;
  const candidate_count = Math.min(3, meta.max_candidate_count || 3);

  return { year, scope_name, template_id, candidate_count, difficulty };
}

export type ParsedApiError = { status: number | null; message: string };

/**
 * Turn a thrown `Error("Quiz API 409: {detail json}")` into a friendly
 * status + message. Falls back to the raw message for anything unexpected.
 */
export function parseApiError(err: unknown): ParsedApiError {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.match(/Quiz API (\d{3}):\s*([\s\S]*)$/);
  if (!m) return { status: null, message: raw };
  const status = Number(m[1]);
  let detail = m[2]?.trim() ?? "";
  // Backend errors are JSON like {"detail":"..."} — extract the human text.
  try {
    const parsed = JSON.parse(detail);
    if (parsed && typeof parsed.detail === "string") detail = parsed.detail;
  } catch {
    /* leave detail as-is */
  }
  return { status, message: detail || raw };
}

/** User-facing message for a builder request failure, tuned per status. */
export function builderErrorMessage(err: unknown): string {
  const { status, message } = parseApiError(err);
  switch (status) {
    case 409:
      return "A matching draft already exists.";
    case 404:
      return "That draft no longer exists.";
    case 403:
      return "Admin key was rejected. Re-enter it to continue.";
    case 400:
      return message || "The request was rejected.";
    default:
      return message || "Something went wrong.";
  }
}

/**
 * Guard: a promotion result must be inactive + unreviewed. If the backend
 * ever reports is_active=true, the caller must treat it as a critical error
 * rather than a success.
 */
export function isUnsafePromotion(result: {
  is_active: boolean;
  review_status: string;
}): boolean {
  return result.is_active === true || result.review_status !== "unreviewed";
}
