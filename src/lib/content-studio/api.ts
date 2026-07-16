/**
 * Typed client for the local Content Studio server
 * (scripts/content-studio/server.ts). Local-only tooling: the base URL
 * defaults to the loopback studio port and is user-configurable in the UI
 * (never persisted anywhere else). No credentials live in the browser — the
 * studio server holds the admin key server-side.
 */
import type { RunManifest } from "@/lib/quiz-screenshot/manifest";

export const DEFAULT_STUDIO_API_BASE = "http://127.0.0.1:8790/api/dev/content-studio";

export type StudioQuestion = {
  id: string | number;
  prompt: string;
  category: string | null;
  choices: string[];
  correct_index: number | null;
  correct_label: string | null;
  content_difficulty: string | null;
  question_type: string | null;
  is_active: boolean | null;
  compatible: boolean;
  incompatible_reason: string | null;
};

export type StudioHealth = {
  ok: boolean;
  backend_configured: boolean;
  api_base: string | null;
  render_base_url: string;
  active_job: string | null;
};

export type StudioJobStatus = {
  id: string;
  state: "queued" | "running" | "succeeded" | "succeeded-with-warnings" | "failed";
  mode: string;
  created_at: string;
  finished_at: string | null;
  run_ids: string[];
  result: { capture_count: number; failure_count: number; warning_count: number } | null;
  error: string | null;
  log: string[];
};

export type StudioRunListEntry = {
  run_id: string;
  modified_at: string;
  mode: string | null;
  package_type: string | null;
  question_count: number | null;
  capture_count: number | null;
  failure_count: number | null;
  warning_count: number | null;
  has_manifest: boolean;
  has_contact_sheet: boolean;
  image_count: number;
};

export type StudioRunDetail = {
  run_id: string;
  manifest: RunManifest | null;
  summary: unknown | null;
  failures: unknown | null;
  images: string[];
  has_contact_sheet: boolean;
};

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, init);
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string; details?: string[] })
    | null;
  if (!res.ok) {
    const detail = body?.details?.length ? ` — ${body.details.join("; ")}` : "";
    throw new Error(`${body?.error ?? `Studio server error ${res.status}`}${detail}`);
  }
  if (body === null) throw new Error("Studio server returned an unreadable response");
  return body;
}

export const studioApi = {
  health: (base: string) => request<StudioHealth>(base, "/health"),
  searchQuestions: (base: string, params: { search?: string; category?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.category) qs.set("category", params.category);
    if (params.limit) qs.set("limit", String(params.limit));
    return request<{ questions: StudioQuestion[] }>(base, `/questions?${qs}`);
  },
  getQuestion: (base: string, id: string) =>
    request<{ question: StudioQuestion }>(base, `/questions/${encodeURIComponent(id)}`),
  createJob: (base: string, body: unknown) =>
    request<{ job_id: string; state: string }>(base, "/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getJob: (base: string, id: string) =>
    request<StudioJobStatus>(base, `/jobs/${encodeURIComponent(id)}`),
  listRuns: (base: string) =>
    request<{ runs: StudioRunListEntry[]; packages: unknown[] }>(base, "/runs"),
  getRun: (base: string, runId: string) =>
    request<StudioRunDetail>(base, `/runs/${encodeURIComponent(runId)}`),
  fileUrl: (base: string, runId: string, rel: string) =>
    `${base}/runs/${encodeURIComponent(runId)}/files/${rel}`,
  zipUrl: (base: string, runId: string) => `${base}/runs/${encodeURIComponent(runId)}/zip`,
  contactSheetUrl: (base: string, runId: string) =>
    `${base}/runs/${encodeURIComponent(runId)}/files/index.html`,
};
