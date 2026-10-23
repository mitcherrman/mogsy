/**
 * Daily Composition Lab — the owner's client (Admin only).
 *
 * Generates sample Daily compositions without gameplay and downloads them as
 * one CSV (one row per graded answer). The server composes with the live
 * composer on a read-only connection; nothing here changes the public Daily,
 * its schedule or any run. Every response carries answers, so it is only ever
 * fetched with the owner's admin headers.
 */
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

export type LabMode = "actual" | "variant";
export const LAB_COUNTS = [1, 5, 10] as const;
export type LabCount = (typeof LAB_COUNTS)[number];

export interface LabRequest {
  date?: string;
  mode?: LabMode;
  count?: LabCount;
  token?: string;
  shuffle?: boolean;
  sampleId?: string;
}

export interface LabRow {
  answer_index: number;
  segment_index: number;
  challenge_index: number;
  act: string;
  set_id: string;
  difficulty_band: string;
  timer_seconds: number;
  interaction: string;
  family: string;
  question_ref: string;
  prompt: string;
  choices_json: string;
  correct_answer: string;
  correct_order_json?: string;
  mr_left_display?: string;
  mr_right_display?: string;
  resolution: string;
  resolution_note: string;
}

export interface LabSummary {
  answers: number;
  unresolved: number;
  resolution: Record<string, number>;
  families: Record<string, number>;
  interactions: Record<string, number>;
  acts: Record<string, number>;
  difficulty: Record<string, number>;
  duplicate_refs: number;
  duplicate_subjects: number;
  refs_shared_with_other_samples?: number;
  quotas: Record<string, number>;
  quotas_unmet: unknown[];
  shortages: unknown[];
}

export interface LabSample {
  sample_id: string;
  status: "composed" | "unavailable";
  mode: LabMode;
  date: string;
  variant_seed: string;
  seed_source: string;
  bank_revision: string;
  content_digest: string;
  config_fingerprint: string;
  composer_version: string;
  summary: LabSummary;
  rows: LabRow[];
}

export interface LabBatch {
  samples: LabSample[];
  batch_refs_in_multiple_samples: number;
  request: { date: string | null; mode: LabMode | null; count: number | null; token: string | null; sample_id: string | null };
}

export class LabError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly code: string | null = null) {
    super(message);
  }
}

const BASE = "/api/daily-run/admin/composition-lab";

async function failure(response: Response, fallback: string): Promise<LabError> {
  try {
    const payload: unknown = await response.json();
    const detail = payload && typeof payload === "object" && "detail" in payload ? (payload as { detail: unknown }).detail : null;
    if (detail && typeof detail === "object" && "message" in detail && typeof (detail as { message: unknown }).message === "string") {
      const d = detail as { message: string; code?: unknown };
      return new LabError(d.message, response.status, typeof d.code === "string" ? d.code : null);
    }
  } catch { /* keep the status */ }
  return new LabError(`${fallback} (${response.status})`, response.status);
}

function isBatch(v: unknown): v is LabBatch {
  return !!v && typeof v === "object" && Array.isArray((v as LabBatch).samples)
    && (v as LabBatch).samples.every((s) => s && typeof s.sample_id === "string" && Array.isArray(s.rows) && !!s.summary);
}

export async function generateSamples(req: LabRequest): Promise<LabBatch> {
  const url = `${ADMIN_API_BASE_URL}${BASE}/samples`;
  const body = req.sampleId
    ? { sample_id: req.sampleId }
    : { date: req.date, mode: req.mode, ...(req.mode === "variant" ? { count: req.count, ...(req.shuffle ? { shuffle: true } : { token: req.token }) } : {}) };
  const response = await fetch(url, {
    method: "POST",
    headers: { ...(await buildAdminHeaders(url)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await failure(response, "Composition samples failed");
  const json: unknown = await response.json();
  if (!isBatch(json)) throw new LabError("The Daily service returned an unreadable batch.");
  return json;
}

/** The export URL for exactly the batch the server just returned. */
export function exportUrl(batch: LabBatch): string {
  const r = batch.request;
  const params = new URLSearchParams();
  if (r.sample_id) params.set("sample_id", r.sample_id);
  else {
    if (r.date) params.set("date", r.date);
    if (r.mode) params.set("mode", r.mode);
    if (r.mode === "variant") {
      if (r.count) params.set("count", String(r.count));
      if (r.token) params.set("token", r.token);
    }
  }
  return `${ADMIN_API_BASE_URL}${BASE}/export.csv?${params.toString()}`;
}

export function exportFilename(batch: LabBatch): string {
  const r = batch.request;
  const raw = r.sample_id ?? `${r.date}_${r.mode}_${r.token ?? "day"}_${r.count ?? 1}`;
  return `daily-composition_${raw.replace(/[^A-Za-z0-9_.-]/g, "_")}.csv`;
}

export async function downloadCsv(batch: LabBatch): Promise<void> {
  const url = exportUrl(batch);
  const response = await fetch(url, { headers: await buildAdminHeaders(url), cache: "no-store" });
  if (!response.ok) throw await failure(response, "CSV export failed");
  const blob = new Blob([await response.text()], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = href;
    a.download = exportFilename(batch);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(href);
  }
}

export function choicesOf(row: LabRow): string[] {
  try {
    const v: unknown = JSON.parse(row.choices_json || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
