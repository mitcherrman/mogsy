import { getAdminKey } from "@/lib/knowledge-admin/key";
import { getBackendAuthHeaders } from "@/lib/backend-auth";

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
  rank?: string | Record<string, any>;
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
  rank?: string | Record<string, any>;
  rank_name?: string;
  rank_icon?: string;
  next_rank?: string | Record<string, any>;
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

export type QuizLeaderboardEntry = {
  user_id: string;
  display_name?: string;
  rank?: string;
  rank_icon?: string;
  xp?: number;
  accuracy?: number;
  attempts?: number;
};

export type DailyChallengeQuestion = QuizQuestion & {
  position?: number;
  answered?: boolean;
};

export type DailyChallengeUserProgress = {
  answered_count: number;
  correct_count: number;
  completed: boolean;
  bonus_awarded: boolean;
  daily_streak: number;
};

export type DailyChallengeGetResponse = {
  ok: boolean;
  challenge?: {
    challenge_date: string;
    theme: string;
    xp_bonus: number;
    question_count: number;
  };
  questions?: DailyChallengeQuestion[];
  progress?: DailyChallengeUserProgress;
  answered_count?: number;
  questions_remaining?: number;
  completed?: boolean;
  daily_streak?: number;
  error?: string;
};

export type DailyChallengeSubmitPayload = {
  user_id?: string;
  question_id: number | string;
  selected_answer: string;
  challenge_date?: string;
  time_taken_ms?: number;
  session_id?: number;
};

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
};

export type DailyChallengeSubmitResult = QuizAnswerResult & {
  daily_progress?: DailyChallengeUserProgress;
  daily_bonus_xp_earned?: number;
};

export type QuizOverride = {
  id: number | string;
  question_id: number | string;
  question_key?: string;
  category?: string;
  new_correct_answer?: string;
  new_explanation?: string;
  notes?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

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
    } catch {}
    throw new Error(`Quiz API ${res.status}: ${detail || res.statusText}`);
  }
  return (await res.json()) as T;
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
  page?: number;
  page_size?: number;
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

// ---------------------------------------------------------------------------
// Quiz Builder (Pro Esports) — admin candidate generation, drafts, promotion.
// All endpoints under /api/quiz/admin/builder/* and use the same adminRequest
// wrapper (X-Admin-Key) as the review console.
// ---------------------------------------------------------------------------

export type QuizBuilderCoverageStatus =
  | "complete" | "partial" | "in_progress" | "unavailable" | "unknown";

export type QuizBuilderCorrectAnswer = { type: string; value: string };

/** Evidence rows are backend-shaped stat objects (champion/picks/bans/…). */
export type QuizBuilderEvidenceRow = Record<string, string | number | null>;

export type QuizBuilderTemplateMeta = {
  template_id: string;
  label: string;
  default_difficulty: number;
  stat_column: string;
};

export type QuizBuilderScopeMeta = { scope_name: string; label: string };

export type QuizBuilderYearMeta = {
  year: number;
  scopes: string[];
  coverage_status: QuizBuilderCoverageStatus;
  production_ready: boolean;
  champions_with_stats: number;
  job_counts: Record<string, number>;
  notes: string[];
};

export type QuizBuilderMeta = {
  source_types: string[];
  templates: QuizBuilderTemplateMeta[];
  scopes: QuizBuilderScopeMeta[];
  years: QuizBuilderYearMeta[];
  difficulties: number[];
  max_candidate_count: number;
};

export type QuizBuilderGenerateRequest = {
  source_type?: string;
  template_id: string;
  year: number;
  scope_name: string;
  candidate_count: number;
  difficulty?: number;
};

export type QuizBuilderCandidate = {
  template_id: string;
  source_type: string;
  question_text: string;
  format: string;
  choices: string[];
  correct_answer: QuizBuilderCorrectAnswer;
  explanation: string;
  difficulty: number;
  year: number;
  scope_name: string;
  scope_label: string;
  coverage_status: QuizBuilderCoverageStatus;
  production_ready: boolean;
  coverage_warnings: string[];
  evidence: QuizBuilderEvidenceRow[];
  source_tables: string[];
  generation_params: Record<string, unknown>;
  warnings: string[];
};

export type QuizBuilderGenerateResponse = {
  candidates: QuizBuilderCandidate[];
  warnings: string[];
};

export type QuizBuilderDraftStatus = "draft" | "rejected" | "sent_to_review";

/** POST /drafts body — mirrors a candidate; server owns key/status/timestamps. */
export type QuizBuilderDraftCreate = {
  source_type: string;
  template_id: string;
  year: number;
  scope_name: string;
  question_text: string;
  question_format?: string;
  choices: string[];
  correct_answer: QuizBuilderCorrectAnswer;
  explanation?: string | null;
  evidence?: QuizBuilderEvidenceRow[];
  generation_params?: Record<string, unknown> | null;
  source_tables?: string[] | null;
  difficulty: number;
  answer_certainty?: string;
  coverage_status?: string | null;
  /** Optional League Docs Pro Data source ({champion_slug, year?, scope?, section?}). */
  pro_data_source?: Record<string, unknown> | null;
  created_by?: string | null;
};

/** PATCH /drafts/{id} body — only editable fields; immutable fields omitted. */
export type QuizBuilderDraftUpdate = {
  question_text?: string;
  choices?: string[];
  correct_answer?: QuizBuilderCorrectAnswer;
  explanation?: string | null;
  difficulty?: number;
  evidence?: QuizBuilderEvidenceRow[];
  generation_params?: Record<string, unknown>;
  coverage_warning?: string | null;
  status?: QuizBuilderDraftStatus;
  rejection_reason?: string | null;
  /** Object to set/replace, explicit null to clear, omit to leave untouched. */
  pro_data_source?: Record<string, unknown> | null;
  updated_by?: string | null;
};

export type QuizBuilderDraft = {
  id: number;
  question_key: string;
  source_type: string;
  template_id: string;
  year: number;
  scope_name: string;
  question_text: string;
  question_format: string;
  choices: string[];
  correct_answer: QuizBuilderCorrectAnswer;
  explanation: string | null;
  evidence: QuizBuilderEvidenceRow[];
  generation_params: Record<string, unknown>;
  source_tables: string[];
  difficulty: number;
  answer_certainty: string;
  coverage_status: QuizBuilderCoverageStatus;
  coverage_warning: string | null;
  pro_data_source: Record<string, unknown> | null;
  status: QuizBuilderDraftStatus;
  rejection_reason: string | null;
  promoted_question_id: number | null;
  sent_to_review_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type QuizBuilderDraftListFilters = {
  status?: string;
  year?: number;
  scope_name?: string;
  template_id?: string;
  source_type?: string;
  coverage_status?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type QuizBuilderDraftListResponse = {
  items: QuizBuilderDraft[];
  total: number;
  limit: number;
  offset: number;
};

export type QuizBuilderPromotionResponse = {
  draft_id: number;
  promoted_question_id: number;
  draft_status: string;
  review_status: string;
  is_active: boolean;
  sent_to_review_at: string | null;
  reviewer_path: string;
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
  stats: () => request<{ stats: QuizStats }>("/api/quiz/stats"),
  submitAnswer: (payload: {
    user_id?: string;
    question_id: number | string;
    selected_answer: string;
    time_taken_ms?: number;
    session_id?: number;
  }) =>
    request<QuizAnswerResult>("/api/quiz/attempts", {
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
  /** Reserved for future leaderboard pages. */
  getLeaderboard: (params?: { limit?: number; offset?: number }) =>
    request<{ entries: QuizLeaderboardEntry[]; total?: number }>(
      `/api/quiz/leaderboard?limit=${params?.limit ?? 50}&offset=${params?.offset ?? 0}`,
    ),
  listOverrides: (activeOnly = false) =>
    request<{ overrides: QuizOverride[] }>(`/api/quiz/admin/overrides${activeOnly ? "?active=true" : ""}`),
  setOverrideActive: (overrideId: number | string, active: boolean) =>
    request<{ ok?: boolean }>(
      `/api/quiz/admin/overrides/${encodeURIComponent(String(overrideId))}/${active ? "activate" : "deactivate"}`,
      { method: "POST" },
    ),
  /** Category breakdown for a user. Pass `"anonymous"` for guest aggregate. */
  getCategories: (userId: string) =>
    request<{ categories: QuizCategoryStat[] }>(`/api/quiz/categories/${encodeURIComponent(userId)}`),
  /** Achievements for a user (unlocked + locked). Pass `"anonymous"` for guest. */
  getAchievements: (userId: string) =>
    request<QuizAchievementsResponse>(`/api/quiz/achievements/${encodeURIComponent(userId)}`),
  /** Fetch today's daily challenge state + questions for a user. */
  getDailyChallenge: (userId: string, challengeDate?: string) =>
    request<DailyChallengeGetResponse>(
      `/api/quiz/daily-challenge?user_id=${encodeURIComponent(userId)}${challengeDate ? `&challenge_date=${encodeURIComponent(challengeDate)}` : ""}`,
    ),
  /** Submit an answer for a daily challenge question. */
  submitDailyChallengeAnswer: (payload: DailyChallengeSubmitPayload) =>
    request<DailyChallengeSubmitResult>("/api/quiz/daily-challenge/submit", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  /** Start a quiz session for history tracking. Failures must not block play. */
  startSession: (payload: { mode?: string; category?: string; difficulty?: string; quiz_set_id?: string }) =>
    request<{ ok: boolean; session_id?: number }>("/api/quiz/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  /** Mark a quiz session finished; backend computes duration + accuracy. */
  completeSession: (sessionId: number) =>
    request<{ ok: boolean }>(`/api/quiz/sessions/${sessionId}/complete`, { method: "POST" }),
  /** Completed quiz sessions for the signed-in (or anonymous) user. Free = last 10, Pro = all. */
  getHistory: () => request<QuizHistoryResponse>("/api/quiz/history"),
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
  getReviewPacks: () =>
    adminRequest<ReviewPacksResponse>("/api/quiz/admin/review/packs"),
  getReviewPackQuestions: (packKey: string) =>
    adminRequest<ReviewPackQuestionsResponse>(
      `/api/quiz/admin/review/packs/${encodeURIComponent(packKey)}/questions`,
    ),

  // ---------------------------------------------------------------------------
  // Quiz Builder (Pro Esports)
  // ---------------------------------------------------------------------------
  getQuizBuilderMeta: () =>
    adminRequest<QuizBuilderMeta>("/api/quiz/admin/builder/meta"),
  generateQuizBuilderCandidates: (req: QuizBuilderGenerateRequest) =>
    adminRequest<QuizBuilderGenerateResponse>("/api/quiz/admin/builder/generate", {
      method: "POST",
      body: JSON.stringify({ source_type: "pro_esports", ...req }),
    }),
  createQuizBuilderDraft: (payload: QuizBuilderDraftCreate) =>
    adminRequest<QuizBuilderDraft>("/api/quiz/admin/builder/drafts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listQuizBuilderDrafts: (filters: QuizBuilderDraftListFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.year !== undefined) params.set("year", String(filters.year));
    if (filters.scope_name) params.set("scope_name", filters.scope_name);
    if (filters.template_id) params.set("template_id", filters.template_id);
    if (filters.source_type) params.set("source_type", filters.source_type);
    if (filters.coverage_status) params.set("coverage_status", filters.coverage_status);
    if (filters.search) params.set("search", filters.search);
    if (filters.limit !== undefined) params.set("limit", String(filters.limit));
    if (filters.offset !== undefined) params.set("offset", String(filters.offset));
    const qs = params.toString();
    return adminRequest<QuizBuilderDraftListResponse>(
      `/api/quiz/admin/builder/drafts${qs ? `?${qs}` : ""}`,
    );
  },
  getQuizBuilderDraft: (id: number) =>
    adminRequest<QuizBuilderDraft>(`/api/quiz/admin/builder/drafts/${id}`),
  updateQuizBuilderDraft: (id: number, patch: QuizBuilderDraftUpdate) =>
    adminRequest<QuizBuilderDraft>(`/api/quiz/admin/builder/drafts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  sendQuizBuilderDraftToReview: (id: number) =>
    adminRequest<QuizBuilderPromotionResponse>(
      `/api/quiz/admin/builder/drafts/${id}/send-to-review`,
      { method: "POST" },
    ),
};
