const API_BASE_URL =
  (import.meta.env.VITE_COMBAT_API_URL as string | undefined) ||
  "http://127.0.0.1:8000";

export type QuizSet = {
  id: number | string;
  name: string;
  description: string;
  question_count: number;
};

export type QuizQuestion = {
  id: number | string;
  category: string;
  question_text: string;
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
};

export type QuizStats = {
  total_questions: number;
  total_attempts: number;
  overall_accuracy: number;
  formats: Record<string, number>;
  categories: Array<{ name: string; question_count: number }>;
  sets: Array<{ name: string; question_count: number }>;
};

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
    request<{ questions: QuizQuestion[] }>(
      `/api/quiz/questions?set=${encodeURIComponent(quizSet)}&limit=${limit}`
    ),
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
      `/api/quiz/admin/reports${status ? `?status=${encodeURIComponent(status)}` : ""}`
    ),
  resolveReport: (
    reportId: number | string,
    payload: { resolution: "resolved" | "invalid"; notes?: string }
  ) =>
    request<{ ok?: boolean }>(
      `/api/quiz/admin/reports/${encodeURIComponent(String(reportId))}/resolve`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
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
};
