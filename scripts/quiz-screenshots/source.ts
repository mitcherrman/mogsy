/**
 * Question acquisition for the screenshot runner. READ-ONLY:
 *  - remote: GET {api}/api/quiz/admin/review/questions (X-Admin-Key), the
 *    same endpoint + env resolution the video prepare script uses. No writes.
 *  - fixture: a local JSON dump (array or {questions:[...]}) — fully offline.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  adaptScreenshotQuestions,
  type ScreenshotSourceQuestion,
  type SkippedSource,
} from "../../src/lib/quiz-screenshot/adapt";
import type { RenderQuestion } from "../../src/lib/quiz-screenshot/types";
import type { ScreenshotCliConfig } from "../../src/lib/quiz-screenshot/cli";

function envFromDotEnv(name: string): string | undefined {
  try {
    const env = readFileSync(resolve(".env"), "utf8");
    const m = env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"));
    return m?.[1];
  } catch {
    return undefined;
  }
}

function resolveApiBase(flag?: string): string {
  const api = (flag ?? process.env.VITE_COMBAT_API_URL ?? envFromDotEnv("VITE_COMBAT_API_URL"))
    ?.replace(/\/+$/, "");
  if (!api) throw new Error("No API base URL. Pass --api or set VITE_COMBAT_API_URL.");
  return api;
}

function resolveAdminKey(flag?: string): string {
  const key = flag ?? process.env.ADMIN_KEY ?? process.env.KNOWLEDGE_ADMIN_KEY;
  if (!key) {
    throw new Error(
      "No admin key. Pass --admin-key <key> or set ADMIN_KEY / KNOWLEDGE_ADMIN_KEY.\n" +
        "(The public quiz API hides correct answers, so the runner reads the admin review endpoint — read-only.)",
    );
  }
  return key;
}

async function fetchReviewPage(
  api: string,
  adminKey: string,
  params: URLSearchParams,
): Promise<{ questions: ScreenshotSourceQuestion[]; total?: number }> {
  const url = `${api}/api/quiz/admin/review/questions?${params}`;
  const res = await fetch(url, { headers: { "X-Admin-Key": adminKey } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Quiz admin API ${res.status}: ${body || res.statusText}`);
  }
  const payload = (await res.json()) as {
    total?: number;
    questions?: ScreenshotSourceQuestion[];
  };
  return { questions: payload.questions ?? [], total: payload.total };
}

export type LoadedQuestions = {
  questions: RenderQuestion[];
  skipped: SkippedSource[];
  sourceDescription: string;
};

export async function loadQuestions(config: ScreenshotCliConfig): Promise<LoadedQuestions> {
  const src = config.source;

  if (src.mode === "fixture") {
    const raw = JSON.parse(readFileSync(resolve(src.path), "utf8"));
    const rows = Array.isArray(raw) ? raw : raw.questions;
    if (!Array.isArray(rows)) {
      throw new Error(`${src.path} must be a question array or contain a "questions" array`);
    }
    const { adapted, skipped } = adaptScreenshotQuestions(rows, src.limit);
    return { questions: adapted, skipped, sourceDescription: `fixture ${src.path}` };
  }

  const api = resolveApiBase(config.api);
  const adminKey = resolveAdminKey(config.adminKey);

  if (src.mode === "question-id") {
    // Direct per-id read: GET /api/quiz/admin/review/questions/{id}
    // → {ok: true, question} | {ok: false, error}. Read-only.
    const rows: ScreenshotSourceQuestion[] = [];
    const skipped: SkippedSource[] = [];
    for (const id of src.ids) {
      const url = `${api}/api/quiz/admin/review/questions/${encodeURIComponent(id)}`;
      const res = await fetch(url, { headers: { "X-Admin-Key": adminKey } });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Quiz admin API ${res.status} for question ${id}: ${body || res.statusText}`);
      }
      const payload = (await res.json()) as {
        ok?: boolean;
        error?: string;
        question?: ScreenshotSourceQuestion;
      };
      if (!payload.ok || !payload.question) {
        skipped.push({ id, reason: payload.error ?? "not found" });
        continue;
      }
      rows.push(payload.question);
    }
    const { adapted, skipped: adaptSkipped } = adaptScreenshotQuestions(rows);
    return {
      questions: adapted,
      skipped: [...skipped, ...adaptSkipped],
      sourceDescription: `question-id ${src.ids.join(",")}`,
    };
  }

  const params = new URLSearchParams({ is_active: "1" });
  // Fetch extra so the adapter can drop unusable rows and still hit the limit.
  params.set("page_size", String(Math.min(Math.max(src.limit * 3, 20), 100)));
  if (src.mode === "pack") params.set("pack_key", src.packKey);
  const { questions } = await fetchReviewPage(api, adminKey, params);
  const { adapted, skipped } = adaptScreenshotQuestions(questions, src.limit);
  return {
    questions: adapted,
    skipped,
    sourceDescription:
      src.mode === "pack"
        ? `pack ${src.packKey} (limit ${src.limit})`
        : `active questions (limit ${src.limit})`,
  };
}
