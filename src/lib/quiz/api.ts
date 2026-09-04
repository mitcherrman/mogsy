import { getAdminKey } from "@/lib/knowledge-admin/key";
import { getBackendAuthHeaders, ensureBackendAuthToken } from "@/lib/backend-auth";

// Optional access: under the Remotion webpack bundle (video export)
// `import.meta.env` is undefined; the Vite app build is unaffected.
const API_BASE_URL = (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000";

export type QuizSet = {
  id: number | string;
  name: string;
  description: string;
  question_count: number;
};

export type QuizQuestion = {
  id: number | string;
  category: string;
  question_key?: string | null;
  question_text?: string | null;
  format: "multiple_choice" | string;
  choices: Array<string | { label: string; raw_stats?: string[] }>;
  image_path?: string;
  difficulty?: number;
  metadata?: Record<string, unknown>;
};

export type QuizAnswerResult = {
  is_correct: boolean;
  correct_answer: string;
  explanation: string;
  xp_earned?: number;
  rank?: string | Record<string, unknown>;
  rank_icon?: string;
  current_xp?: number;
  current_streak?: number;
  unlocked_achievements?: Array<{
    id?: string | number;
    name?: string;
    description?: string;
    icon_path?: string;
  }>;
};

export type QuizStats = {
  total_questions: number;
  total_attempts: number;
  overall_accuracy: number;
  formats: Record<string, number>;
  categories: Array<{ name: string; question_count: number }>;
  sets: Array<{ name: string; question_count: number }>;
};

export type QuizProgress = {
  user_id?: string;
  rank?: string | Record<string, unknown>;
  rank_name?: string;
  rank_icon?: string;
  next_rank?: string | Record<string, unknown>;
  next_rank_name?: string;
  next_rank_icon?: string;
  xp?: number;
  xp_to_next?: number;
  progress_percent?: number;
  current_streak?: number;
  best_streak?: number;
  accuracy?: number;
  attempts?: number;
  correct?: number;
  // The backend progress endpoint returns these names (see routes/quiz.py):
  total_xp?: number;
  total_attempts?: number;
  correct_attempts?: number;
  /**
   * RE1 Phase 2/2B, additive: the five-tier Academy standing and its interval
   * progress, all derived by the backend from `total_xp`. These never replace
   * `rank` / `rank_name`, which stay the legacy 11-tier values.
   *
   * Every field is typed `unknown` on purpose — this is the wire, and an
   * older backend omits the whole block. `parseAcademyProgression` validates
   * them together and returns null unless the set is coherent, so the card
   * falls back to legacy rendering rather than rendering half a migration.
   *
   * The percentage and interval bounds are computed server-side beside
   * ACADEMY_THRESHOLDS and are NOT recomputed here: one authority, so a
   * later threshold change cannot leave this client disagreeing.
   */
  academy_tier?: unknown;
  /** The tier above, or null at Challenger (the max tier). */
  academy_next_tier?: unknown;
  /** Inclusive XP that entered the current tier — the bar's floor. */
  academy_current_tier_xp?: unknown;
  /** XP that enters the next tier — the bar's ceiling; null at Challenger. */
  academy_next_tier_xp?: unknown;
  /** Remaining XP to the next tier; 0 at Challenger. */
  academy_xp_to_next?: unknown;
  /** Position within the current tier's interval, 0-100. */
  academy_progress_percent?: unknown;
};

/** Answered-question total, tolerant of both `attempts` and the backend's `total_attempts`. */
export function progressAttempts(progress?: QuizProgress | null): number {
  return Number(progress?.attempts ?? progress?.total_attempts ?? 0) || 0;
}

export type QuizCategoryStat = {
  /** Some payloads use `category`; the progress endpoint returns `category_name`. */
  category?: string;
  category_name?: string;
  accuracy: number;
  attempts: number;
  correct?: number;
};

/** Display label for a category stat, tolerant of both backend field names. */
export function categoryLabel(stat: Pick<QuizCategoryStat, "category" | "category_name">): string {
  return stat.category_name || stat.category || "Uncategorized";
}

export type QuizAchievement = {
  id?: string | number;
  key?: string;
  name?: string;
  title?: string;
  description?: string;
  icon_path?: string;
  unlocked?: boolean;
  unlocked_at?: string | null;
  progress?: number;
  goal?: number;
  category?: string;
  tier?: string;
};

export type QuizAchievementsResponse = {
  achievements?: QuizAchievement[];
  unlocked?: QuizAchievement[];
  locked?: QuizAchievement[];
  total?: number;
  unlocked_count?: number;
};

// QuizLeaderboardEntry removed with getLeaderboard: it typed the response of
// /api/quiz/leaderboard, which the backend does not serve.

// The legacy five-question Daily's request/response types went with its
// client above. DC2 declares its own, parsed rather than cast, in
// `src/lib/daily-challenge/contracts.ts`.


export type QuizHistoryEntry = {
  session_id: number;
  date: string;
  started_at?: string;
  completed_at?: string;
  mode?: string;
  category?: string | null;
  difficulty?: string | null;
  quiz_set_id?: string | null;
  score: number;
  total_questions: number;
  accuracy: number;
  duration_seconds?: number | null;
};

export type MissedQuestion = {
  attempt_id: number;
  question_id: number;
  question_text: string | null;
  selected_answer: string | null;
  correct_answer: string;
  category: string | null;
  difficulty: number | null;
  missed_at: string;
  explanation: string | null;
};

export type MissedQuestionsResponse = {
  ok: boolean;
  is_pro: boolean;
  locked: boolean;
  results: MissedQuestion[];
  upsell_message?: string;
  total_count?: number;
  limit?: number;
  offset?: number;
};

export type QuizHistoryResponse = {
  ok: boolean;
  is_pro: boolean;
  results: QuizHistoryEntry[];
  total_count: number;
  limited: boolean;
  free_limit: number;
  upsell_message: string | null;
  // "error" when the backend could not determine entitlement; history then
  // degrades to the Free limit with no upsell.
  entitlement_status?: "ok" | "error";
};

export type EntitlementResponse = {
  ok: boolean;
  user_id: string;
  is_pro: boolean;
  pro_lookup_configured: boolean;
};

// QuizOverride removed with listOverrides/setOverrideActive: it typed the
// rows returned by /api/quiz/admin/overrides, which the backend does not
// serve. Creating an override is a separate, real endpoint and needs no type
// here — overrideQuestion posts a literal payload.

/** Resolve a backend-provided icon path to an absolute URL. */
export function resolveQuizAssetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  // Remotion export override: the video bundle has no import.meta.env, so the
  // prepare step embeds the API base in the input JSON and QuizVideo publishes
  // it here. Never set in the live app.
  const override = (globalThis as { __MOGSY_ASSET_BASE__?: string }).__MOGSY_ASSET_BASE__;
  const base = (override || API_BASE_URL).replace(/\/+$/, "");
  const rel = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${base}/${rel}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = await getBackendAuthHeaders();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // Response body unreadable; fall back to statusText below.
    }
    throw new Error(`Quiz API ${res.status}: ${detail || res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Thrown when a write could not be sent because no Supabase session — not
 *  even an anonymous one — could be established. */
export class QuizAuthRequiredError extends Error {
  constructor(path: string) {
    super(`Quiz API ${path}: no Supabase session available to authenticate the request`);
    this.name = "QuizAuthRequiredError";
  }
}

/**
 * Request helper for endpoints that PERSIST user-owned rows.
 *
 * The backend attributes these writes to the verified JWT subject and rejects
 * unverified callers, so a best-effort `getBackendAuthHeaders()` is not enough:
 * it returns `{}` whenever the Supabase session has not landed yet, which is
 * exactly the state a page is in for the first few hundred ms after mount.
 *
 * `ensureBackendAuthToken()` establishes a session — signing in anonymously if
 * the visitor is a guest — and waits for it, so guest play is preserved while
 * the tokenless window is closed. If no session can be established at all we
 * throw rather than send a request that would be silently misattributed under
 * the legacy fallback (or 401 under enforcement).
 */
async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await ensureBackendAuthToken();
  if (!token) throw new QuizAuthRequiredError(path);
  return request<T>(path, {
    ...init,
    // Spread last in `request`, so this wins over getBackendAuthHeaders().
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
  });
}

/** Thrown when the admin key is missing or rejected by the backend (403). */
export class QuizAdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizAdminAuthError";
  }
}

/**
 * Shared fetch path for every /api/quiz/admin/* endpoint. Account-bound: the
 * base `request` already attaches the current Supabase bearer token (the normal
 * browser admin path), so no admin key is required for a signed-in allowlisted
 * owner. When an explicit fallback key is active it is additionally attached as
 * X-Admin-Key (the backend authorizes on either path). Never used for public
 * quiz endpoints, so credentials aren't sent where they aren't needed.
 */
async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getAdminKey(); // only present in explicit fallback mode
  const headers = { ...(init?.headers || {}) } as Record<string, string>;
  if (key) headers["X-Admin-Key"] = key;
  try {
    return await request<T>(path, { ...init, headers });
  } catch (e) {
    if (e instanceof Error && /\b403\b/.test(e.message)) {
      throw new QuizAdminAuthError("Not authorized for admin access");
    }
    throw e;
  }
}

async function adminDownload(path: string): Promise<{ blob: Blob; filename: string; rowCount?: number }> {
  const key = getAdminKey();
  const authHeaders = await getBackendAuthHeaders();
  const headers: Record<string, string> = { ...authHeaders };
  if (key) headers["X-Admin-Key"] = key;
  const res = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 403) throw new QuizAdminAuthError("Not authorized for admin access");
    throw new Error(`Quiz API ${res.status}: ${detail || res.statusText}`);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "mogzy-question-review.csv";
  const count = res.headers.get("X-Export-Row-Count");
  return { blob: await res.blob(), filename, rowCount: count == null ? undefined : Number(count) };
}

export type QuizReport = {
  id: number | string;
  question_id: number | string;
  question_key?: string;
  category?: string;
  question_text?: string;
  current_correct_answer?: string;
  reported_answer?: string;
  expected_answer?: string;
  reason?: string;
  report_type?: string;
  reporter_id?: string;
  status?: "open" | "resolved" | "invalid" | string;
  created_at?: string;
};

// ---------------------------------------------------------------------------
// Quiz Review Console types
// ---------------------------------------------------------------------------

export type ReviewQuestionPack = {
  pack_key: string;
  title: string;
  position?: number | null;
};

export type ReviewQuestion = {
  id: number;
  question_key?: string | null;
  question_text?: string | null;
  category: string;
  source_type?: string | null;
  difficulty?: number;
  answer_certainty?: string;
  format: string;
  choices: Array<string | { label: string; raw_stats?: string[] }>;
  correct_answer?: { type?: string; value?: string; case_sensitive?: boolean };
  explanation?: string | null;
  image_path?: string | null;
  is_active: boolean;
  review_status: string;
  review_note?: string | null;
  favorite_for_shorts: boolean;
  missing_asset: boolean;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown>;
  pack_keys?: string[];
  packs?: ReviewQuestionPack[];
};

export type ReviewListResponse = {
  ok: boolean;
  total: number;
  page: number;
  page_size: number;
  pages: number;
  questions: ReviewQuestion[];
};

export type ReviewFilterOptions = {
  ok: boolean;
  categories: string[];
  source_types: string[];
  formats: string[];
  review_statuses: string[];
  packs?: Array<{ pack_key: string; title: string }>;
};

export type ReviewPackSummary = {
  pack_key: string;
  title: string;
  description?: string | null;
  topic?: string | null;
  champion?: string | null;
  calculation_type?: string | null;
  scenario_family?: string | null;
  intended_use?: string[];
  difficulty_min?: number | null;
  difficulty_max?: number | null;
  status?: string;
  question_count?: number;
};

export type ReviewPacksResponse = { ok: boolean; packs: ReviewPackSummary[] };
export type ReviewUniverseRow = {
  review_key: string;
  source_kind: string;
  materialization: string;
  family: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty: number | string;
  topic_category: string;
  source_status: string;
  review_status: string;
  source_version: string;
  dataset_id: string;
  metadata: Record<string, unknown>;
};
export type ReviewUniverseResponse = {
  ok: boolean;
  total: number;
  page: number;
  page_size: number;
  pages: number;
  rows: ReviewUniverseRow[];
  provenance: {
    schema_version: string;
    exported_at: string;
    baseline_id: string;
    content_digest: string;
    row_count: number;
    source_counts: Record<string, number>;
    collector_errors: Array<{ source: string; error: string }>;
    database: { name: string; dataset_id: string; size_bytes?: number | null };
  };
};
export type ReviewPackQuestionsResponse = {
  ok: boolean;
  pack: ReviewPackSummary;
  total: number;
  questions: ReviewQuestion[];
};

export type ReviewFilters = {
  search?: string;
  category?: string;
  source_type?: string;
  difficulty_min?: number;
  difficulty_max?: number;
  answer_certainty?: string;
  format?: string;
  review_status?: string;
  is_active?: number;
  favorite_for_shorts?: number;
  missing_asset?: number;
  has_image?: number;
  ability_slot?: string;
  subject_type?: string;
  pack_key?: string;
  /**
   * Diagnostics deep link: the exact question rows a finding concerns.
   * An EMPTY array is a real selection meaning "no rows" (the finding matched
   * nothing in this database) and is sent as such — dropping it would silently
   * widen the view to the whole bank, which is the opposite of what was asked.
   */
  ids?: number[];
  /** Family = the `question_key` prefix the audit and the registry share. */
  family?: string;
  page?: number;
  page_size?: number;
};

// ---------------------------------------------------------------------------
// Quiz audit (Diagnostics) types — the compact shape of the read-only harness.
// ---------------------------------------------------------------------------

export type AuditSeverity = "critical" | "warn" | "info";

/**
 * Where a diagnostic card sends the operator in Quiz Review.
 *  - `ids`      the exact rows the finding concerns (the common case)
 *  - `family`   a question_key prefix, for family-level verdicts
 *  - `search`   a term, for findings whose subject is an ITEM rather than a row
 *  - `none`     nothing to open (e.g. a champion missing from the database)
 */
export type AuditTarget = {
  kind: "ids" | "family" | "search" | "none";
  ids: number[];
  family?: string;
  search?: string;
  matched: number;
  unmatched: number;
  truncated: boolean;
};

export type AuditChip = { label: string; detail: string; target: AuditTarget };

export type AuditGroup = {
  id: string;
  section: string;
  label: string;
  count: number;
  severity: AuditSeverity;
  target: AuditTarget;
  detail: string;
  chips: AuditChip[];
};

export type QuizAuditSummary = {
  status: string;
  database_roster_count: number;
  expected_roster_count: number;
  roster_complete: boolean;
  roster_missing_from_database: string[];
  expected_roster_source: string;
  questions_audited: number;
  suspicious_questions: number;
  invalid_items: number;
  retired_item_references: number;
  realism_violations: number;
  refresh_reconstruction_failures: number;
  new_regressions: number | null;
  families_needing_review: string[];
  review_backlog: number;
  critical_findings: number;
};

export type QuizAuditReport = {
  ok: boolean;
  cached: boolean;
  status: string;
  generated_at?: string | null;
  elapsed_seconds?: number | null;
  revision?: string | null;
  database: { path: string; name: string };
  tests_ran: boolean;
  baseline_ran: boolean;
  baseline_error?: string | null;
  summary: QuizAuditSummary;
  groups: AuditGroup[];
  findings_total: number;
  sections: {
    roster?: Record<string, unknown>;
    families?: { families?: number; active_families?: number; unregenerable?: string[]; unknown_to_registry?: string[] };
    champions?: { unresolved?: string[] };
    items?: { items_referenced?: number; current?: number; invalid_items?: string[]; retired_items?: string[]; questions_referencing_retired_items?: number; authority_findings?: Record<string, number> };
    bank?: { questions?: number; gates?: Record<string, number>; live_answer_defects?: number; verdicts?: Record<string, number>; unchecked?: number };
    realism?: { checked_family?: string; violations?: Record<string, number>; total?: number };
    reconstruction?: { checked?: number; reconstructed?: number; failures?: Record<string, number>; total_failures?: number };
    refresh?: { affected?: number; by_reason?: Record<string, number> };
    generator?: { ran?: boolean; error?: string; would_create?: number; already_present?: number; skipped_total?: number; skipped_by_reason?: Record<string, number> };
    tests?: { ran?: boolean; reason?: string; counts?: Record<string, number> };
    environment?: Record<string, unknown>;
  };
  baseline?: {
    rev?: string;
    new_count: number;
    new_critical: number;
    fixed_count: number;
    by_section?: Record<string, number>;
    new: Array<{ id: string; section: string; kind: string; subject: string; detail?: string; severity?: string }>;
  } | null;
};

/**
 * Local-vs-production canonical database alignment.
 *
 * `gated` and `unreachable` are first-class statuses, deliberately distinct
 * from MATCH: a check that could not see production must say so rather than
 * stay quiet and read as aligned.
 */
export type DbDriftStatus = "MATCH" | "DRIFT DETECTED" | "INCOMPARABLE" | "gated" | "unreachable";

export type DbDriftDifference = {
  area: "schema" | "roster" | "table" | "questions" | "items" | string;
  detail: string;
  missing_locally?: string[];
  missing_remotely?: string[];
  families?: Array<{ family: string; local: number; remote: number }>;
  table?: string;
  local?: unknown;
  remote?: unknown;
};

export type DbDriftReport = {
  ok: boolean;
  status: DbDriftStatus;
  reason?: string;
  differences: DbDriftDifference[];
  local_source?: string;
  remote_source?: string;
  local_roster?: number | null;
  remote_roster?: number | null;
};

export type ReviewPatchPayload = {
  review_status?: string;
  review_note?: string;
  favorite_for_shorts?: boolean;
  missing_asset?: boolean;
  difficulty?: number;
  answer_certainty?: string;
  is_active?: boolean;
  reviewed_by?: string;
};

export type PlaylistFilters = {
  difficulty_min?: number;
  difficulty_max?: number;
  source_type?: string;
  category?: string;
  /** Omit to default to quiz-eligible (objective + derived). */
  answer_certainty?: string;
  limit?: number;
};

export type PlaylistResponse = {
  ok: boolean;
  count: number;
  filters: Record<string, unknown>;
  questions: QuizQuestion[];
};

export const quizApi = {
  baseUrl: API_BASE_URL,
  sets: () => request<{ sets: QuizSet[] }>("/api/quiz/sets"),
  /** Fetch a filtered, randomized question set. Powers Shorts, playlists, practice modes. */
  getPlaylist: (filters: PlaylistFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.difficulty_min !== undefined) params.set("difficulty_min", String(filters.difficulty_min));
    if (filters.difficulty_max !== undefined) params.set("difficulty_max", String(filters.difficulty_max));
    if (filters.source_type) params.set("source_type", filters.source_type);
    if (filters.category) params.set("category", filters.category);
    if (filters.answer_certainty) params.set("answer_certainty", filters.answer_certainty);
    if (filters.limit !== undefined) params.set("limit", String(filters.limit));
    const qs = params.toString();
    return request<PlaylistResponse>(`/api/quiz/playlist${qs ? `?${qs}` : ""}`);
  },
  questions: (quizSet: string, limit = 10) =>
    request<{ questions: QuizQuestion[] }>(`/api/quiz/questions?set=${encodeURIComponent(quizSet)}&limit=${limit}`),
  /**
   * The SAME Practice endpoint, addressed by `quiz_categories.name` instead of
   * by set. Same `PRACTICE_MODE` family gate, same `is_active` predicate, same
   * row formatter — `routes/quiz.py` branches only on which predicate it adds.
   * Powers the lobby category rail; see `@/lib/quiz/practiceCategories`.
   */
  categoryQuestions: (category: string, limit = 10) =>
    request<{ questions: QuizQuestion[] }>(`/api/quiz/questions?category=${encodeURIComponent(category)}&limit=${limit}`),
  stats: () => request<{ stats: QuizStats }>("/api/quiz/stats"),
  /** Records an attempt. Attributed by the backend to the verified JWT
   *  subject; `user_id` is ignored server-side and kept only so existing
   *  callers still typecheck. */
  submitAnswer: (payload: {
    /** @deprecated ignored by the backend — attribution comes from the JWT. */
    user_id?: string;
    question_id: number | string;
    selected_answer: string;
    time_taken_ms?: number;
    session_id?: number;
  }) =>
    authedRequest<QuizAnswerResult>("/api/quiz/attempts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reportQuestion: (payload: {
    question_id: number | string;
    reporter_id?: string;
    report_type: string;
    reported_answer?: string;
    expected_answer?: string;
    reason?: string;
  }) =>
    request<{ ok?: boolean; id?: number | string }>("/api/quiz/reports", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getReports: (status?: string) =>
    request<{ reports: QuizReport[] }>(
      `/api/quiz/admin/reports${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  resolveReport: (reportId: number | string, payload: { resolution: "resolved" | "invalid"; notes?: string }) =>
    request<{ ok?: boolean }>(`/api/quiz/admin/reports/${encodeURIComponent(String(reportId))}/resolve`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  overrideQuestion: (payload: {
    question_id: number | string;
    new_correct_answer: string;
    new_explanation?: string;
    notes?: string;
    report_id?: number | string;
  }) =>
    request<{ ok?: boolean }>("/api/quiz/admin/override-question", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  /** Progression for a user. Pass `"anonymous"` for guest aggregate. */
  getProgress: (userId: string) => request<QuizProgress>(`/api/quiz/progress/${encodeURIComponent(userId)}`),
  // getLeaderboard, listOverrides and setOverrideActive were removed: the
  // backend exposes no /api/quiz/leaderboard and no /api/quiz/admin/overrides
  // routes, so every call 404'd. getLeaderboard had no call sites at all; the
  // other two backed the Active Overrides panel in QuizAdmin, removed with
  // them. Applying an override (POST /api/quiz/admin/override-question) is a
  // real endpoint and is untouched.
  /** Category breakdown for a user. Pass `"anonymous"` for guest aggregate. */
  getCategories: (userId: string) =>
    request<{ categories: QuizCategoryStat[] }>(`/api/quiz/categories/${encodeURIComponent(userId)}`),
  /** Achievements for a user (unlocked + locked). Pass `"anonymous"` for guest. */
  getAchievements: (userId: string) =>
    request<QuizAchievementsResponse>(`/api/quiz/achievements/${encodeURIComponent(userId)}`),
  /* THE LEGACY DAILY CLIENT IS GONE.
     `GET /api/quiz/daily-challenge` and its `/submit` are the five-question
     in-page Daily this app no longer has. The Daily Challenge is DC2
     (`src/lib/daily-challenge/client.ts`, `/api/daily-challenge/*`), and its
     entry is the match-entry record. Both backend routes stay registered and
     serve their own history; nothing in this frontend calls them, and a new
     caller here would be reviving a retired mode rather than reusing a helper.
     The GET also MATERIALISES the day server-side, so calling it speculatively
     writes rows for a product that is no longer played. */
  /** Start a quiz session for history tracking. Failures must not block play. */
  startSession: (payload: { mode?: string; category?: string; difficulty?: string; quiz_set_id?: string }) =>
    authedRequest<{ ok: boolean; session_id?: number }>("/api/quiz/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  /** Mark a quiz session finished; backend computes duration + accuracy.
   *  Must carry the same identity that startSession used, or the backend's
   *  owner-scoped UPDATE matches nothing and the session never completes. */
  completeSession: (sessionId: number) =>
    authedRequest<{ ok: boolean }>(`/api/quiz/sessions/${sessionId}/complete`, { method: "POST" }),
  /** Completed quiz sessions for the signed-in (or anonymous) user. Free = last 10, Pro = all. */
  getHistory: () => request<QuizHistoryResponse>("/api/quiz/history"),
  /** Authoritative backend Pro entitlement for the signed-in user (JWT-scoped). */
  getEntitlement: () => request<EntitlementResponse>("/api/quiz/entitlement"),
  /** Missed Question Bank. Free users get a locked/upsell state; Pro users get the data. */
  getMissedQuestions: (params?: { limit?: number; offset?: number }) =>
    request<MissedQuestionsResponse>(
      `/api/quiz/missed-questions?limit=${params?.limit ?? 50}&offset=${params?.offset ?? 0}`,
    ),

  // ---------------------------------------------------------------------------
  // Quiz Review Console
  // ---------------------------------------------------------------------------
  getReviewQuestions: (filters: ReviewFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.category) params.set("category", filters.category);
    if (filters.source_type) params.set("source_type", filters.source_type);
    if (filters.difficulty_min !== undefined) params.set("difficulty_min", String(filters.difficulty_min));
    if (filters.difficulty_max !== undefined) params.set("difficulty_max", String(filters.difficulty_max));
    if (filters.answer_certainty) params.set("answer_certainty", filters.answer_certainty);
    if (filters.format) params.set("format", filters.format);
    if (filters.review_status) params.set("review_status", filters.review_status);
    if (filters.is_active !== undefined) params.set("is_active", String(filters.is_active));
    if (filters.favorite_for_shorts !== undefined) params.set("favorite_for_shorts", String(filters.favorite_for_shorts));
    if (filters.missing_asset !== undefined) params.set("missing_asset", String(filters.missing_asset));
    if (filters.has_image !== undefined) params.set("has_image", String(filters.has_image));
    if (filters.ability_slot) params.set("ability_slot", filters.ability_slot);
    if (filters.subject_type) params.set("subject_type", filters.subject_type);
    if (filters.pack_key) params.set("pack_key", filters.pack_key);
    // `ids: []` must still be sent (see the type doc): presence, not
    // truthiness, is what distinguishes "nothing matched" from "not filtered".
    if (filters.ids !== undefined) params.set("ids", filters.ids.join(","));
    if (filters.family) params.set("family", filters.family);
    if (filters.page !== undefined) params.set("page", String(filters.page));
    if (filters.page_size !== undefined) params.set("page_size", String(filters.page_size));
    const qs = params.toString();
    return adminRequest<ReviewListResponse>(`/api/quiz/admin/review/questions${qs ? `?${qs}` : ""}`);
  },
  getReviewQuestion: (id: number) =>
    adminRequest<{ ok: boolean; question: ReviewQuestion }>(`/api/quiz/admin/review/questions/${id}`),
  patchReviewQuestion: (id: number, payload: ReviewPatchPayload) =>
    adminRequest<{ ok: boolean; question_id: number; updated: string[] }>(
      `/api/quiz/admin/review/questions/${id}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
  getReviewFilterOptions: () =>
    adminRequest<ReviewFilterOptions>("/api/quiz/admin/review/filter-options"),

  // ---------------------------------------------------------------------------
  // Quiz audit (Diagnostics tab). Read-only: the backend wraps the same harness
  // `./scripts/quiz_audit.sh` runs, which opens mode=ro handles only.
  // ---------------------------------------------------------------------------
  getQuizAudit: (opts: { refresh?: boolean; tests?: boolean; baseline?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.refresh) params.set("refresh", "true");
    if (opts.tests) params.set("tests", "true");
    if (opts.baseline) params.set("baseline", "true");
    const qs = params.toString();
    return adminRequest<QuizAuditReport>(`/api/quiz/admin/audit${qs ? `?${qs}` : ""}`);
  },
  downloadAuditFlaggedCsv: () => adminDownload("/api/quiz/admin/audit/flagged.csv"),
  /** Compare this deployment's canonical DB state against production. */
  getDbDrift: () => adminRequest<DbDriftReport>("/api/quiz/admin/db-drift"),
  downloadReviewExport: (scope: "all" | "changed" | "flagged", currentBaseline = "current") => {
    const params = new URLSearchParams({ scope });
    if (currentBaseline) params.set("current_baseline", currentBaseline);
    return adminDownload(`/api/quiz/admin/review/export.csv?${params}`);
  },
  getReviewUniverse: (filters: { source_kind?: string; family?: string; materialization?: string; source_status?: string; search?: string; page?: number; page_size?: number } = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)); });
    return adminRequest<ReviewUniverseResponse>(`/api/quiz/admin/review/universe?${params}`);
  },
  downloadReviewUniverseExport: () => adminDownload("/api/quiz/admin/review/universe/export.csv"),
  getReviewPacks: () =>
    adminRequest<ReviewPacksResponse>("/api/quiz/admin/review/packs"),
  getReviewPackQuestions: (packKey: string) =>
    adminRequest<ReviewPackQuestionsResponse>(
      `/api/quiz/admin/review/packs/${encodeURIComponent(packKey)}/questions`,
    ),
};
