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
  rank?: string;
  rank_icon?: string;
  current_xp?: number;
  current_streak?: number;
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

export type QuizLeaderboardEntry = {
  user_id: string;
  display_name?: string;
  rank?: string;
  rank_icon?: string;
  xp?: number;
  accuracy?: number;
  attempts?: number;
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
  const rel = path.replace(/^\/+/, "");
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

export const quizApi = {
  baseUrl: API_BASE_URL,
  sets: () => request<{ sets: QuizSet[] }>("/api/quiz/sets"),
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
  getProgress: (userId: string) =>
    request<QuizProgress>(`/api/quiz/progress/${encodeURIComponent(userId)}`),
  /** Reserved for future leaderboard pages. */
  getLeaderboard: (params?: { limit?: number; offset?: number }) =>
    request<{ entries: QuizLeaderboardEntry[]; total?: number }>(
      `/api/quiz/leaderboard?limit=${params?.limit ?? 50}&offset=${params?.offset ?? 0}`,
    ),
  listOverrides: (activeOnly = false) =>
    request<{ overrides: QuizOverride[] }>(
      `/api/quiz/admin/overrides${activeOnly ? "?active=true" : ""}`,
    ),
  setOverrideActive: (overrideId: number | string, active: boolean) =>
    request<{ ok?: boolean }>(
      `/api/quiz/admin/overrides/${encodeURIComponent(String(overrideId))}/${active ? "activate" : "deactivate"}`,
      { method: "POST" },
    ),
  /** Category breakdown for a user. Pass `"anonymous"` for guest aggregate. */
  getCategories: (userId: string) =>
    request<{ categories: QuizCategoryStat[] }>(`/api/quiz/categories/${encodeURIComponent(userId)}`),
};
