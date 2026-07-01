const API_BASE_URL = (import.meta.env.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000";

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
};

export type QuizCategoryStat = {
  category: string;
  accuracy: number;
  attempts: number;
};

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
  const base = API_BASE_URL.replace(/\/+$/, "");
  const rel = path.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${base}/${rel}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
    if (filters.page !== undefined) params.set("page", String(filters.page));
    if (filters.page_size !== undefined) params.set("page_size", String(filters.page_size));
    const qs = params.toString();
    return request<ReviewListResponse>(`/api/quiz/admin/review/questions${qs ? `?${qs}` : ""}`);
  },
  getReviewQuestion: (id: number) =>
    request<{ ok: boolean; question: ReviewQuestion }>(`/api/quiz/admin/review/questions/${id}`),
  patchReviewQuestion: (id: number, payload: ReviewPatchPayload) =>
    request<{ ok: boolean; question_id: number; updated: string[] }>(
      `/api/quiz/admin/review/questions/${id}`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
  getReviewFilterOptions: () =>
    request<ReviewFilterOptions>("/api/quiz/admin/review/filter-options"),
};
