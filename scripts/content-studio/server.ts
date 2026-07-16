/**
 * Content Post Studio — local-only server.
 *
 *   npm run content-studio
 *   → studio API on http://127.0.0.1:8790 (loopback only)
 *   → render/UI dev server on http://127.0.0.1:5199
 *   → open http://127.0.0.1:5199/dev/content-studio
 *
 * The server calls the SAME in-process generation service as the CLI
 * (scripts/quiz-screenshots/generate.ts) — no subprocesses, no shell strings,
 * no second screenshot engine. All request input is validated against
 * allowlists (src/lib/quiz-screenshot/studio-request.ts); files are served
 * only from under <outRoot>/runs via safeRunFilePath.
 *
 * Security boundaries:
 *  - binds 127.0.0.1 only; CORS restricted to loopback origins
 *  - the admin key is read from the server process env and used server-side
 *    for backend question reads; it is never sent to the browser, never
 *    logged, never written into run output
 *  - one generation job at a time; further POST /jobs → 409
 *
 * Remote/on-the-go use is deliberately NOT exposed here — see
 * scripts/content-studio/README.md for the recommended secure architecture.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import {
  validateStudioJob,
  type StudioJobRequest,
} from "../../src/lib/quiz-screenshot/studio-request";
import { parseFormats } from "../../src/lib/quiz-screenshot/formats";
import type { RenderState } from "../../src/lib/quiz-screenshot/types";
import {
  adaptScreenshotQuestion,
  type ScreenshotSourceQuestion,
} from "../../src/lib/quiz-screenshot/adapt";
import { DEFAULT_EXPORT_ROOT } from "../../src/lib/quiz-screenshot/paths";
import {
  runDailyPackage,
  runGeneration,
  type GenerationRequest,
} from "../quiz-screenshots/generate";
import { ensureServer, type ManagedServer } from "../quiz-screenshots/server";
import {
  getRunDetail,
  isValidRunId,
  listPackages,
  listRuns,
  safeRunFilePath,
} from "./runs";

const STUDIO_HOST = "127.0.0.1";
const STUDIO_PORT = Number(process.env.CONTENT_STUDIO_PORT ?? 8790);
const OUT_ROOT = DEFAULT_EXPORT_ROOT;
const RUNS_ROOT = resolve(OUT_ROOT, "runs");
const API_PREFIX = "/api/dev/content-studio";
const LOOPBACK_ORIGIN_RE = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/;
const MAX_BODY_BYTES = 256 * 1024;

// ── Backend (question source) configuration — server-side only ──────────────

function envFromDotEnv(name: string): string | undefined {
  try {
    const env = readFileSync(resolve(".env"), "utf8");
    const m = env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"));
    return m?.[1];
  } catch {
    return undefined;
  }
}

function apiBase(): string | null {
  const api = (process.env.VITE_COMBAT_API_URL ?? envFromDotEnv("VITE_COMBAT_API_URL"))?.replace(
    /\/+$/,
    "",
  );
  return api || null;
}

function adminKey(): string | null {
  return process.env.ADMIN_KEY ?? process.env.KNOWLEDGE_ADMIN_KEY ?? null;
}

// ── Job store (one active job) ───────────────────────────────────────────────

type JobState =
  | "queued"
  | "running"
  | "succeeded"
  | "succeeded-with-warnings"
  | "failed";

type StudioJob = {
  id: string;
  state: JobState;
  mode: string;
  created_at: string;
  finished_at: string | null;
  /** Progress log lines (no secrets ever pass through here). */
  log: string[];
  request: StudioJobRequest;
  run_ids: string[];
  result: {
    capture_count: number;
    failure_count: number;
    warning_count: number;
  } | null;
  error: string | null;
};

const jobs = new Map<string, StudioJob>();
let activeJobId: string | null = null;
let jobCounter = 0;

function suggestRunId(mode: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `studio-${mode}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function jobHooks(job: StudioJob) {
  return {
    log: () => {},
    onProgress: (e: { phase: string; message: string }) => {
      for (const line of e.message.split("\n")) {
        const trimmed = line.trimEnd();
        if (trimmed) job.log.push(`[${e.phase}] ${trimmed}`);
      }
      if (job.log.length > 2000) job.log.splice(0, job.log.length - 2000);
    },
  };
}

function toGenerationRequest(
  req: StudioJobRequest,
  runId: string,
  baseUrl: string,
): GenerationRequest {
  return {
    source: { mode: "question-id", ids: req.questionIds },
    states: (req.states as RenderState[] | undefined) ?? ["question", "correct"],
    formats: parseFormats(req.formats.join(",")),
    post:
      req.mode === "single-question" || req.mode === "answer-reveal" ? req.mode : undefined,
    multiQuestion:
      req.mode === "multi-question"
        ? {
            repeatVariant: req.challenge.repeatVariant,
            midCtaVariant: req.challenge.midCtaVariant,
          }
        : undefined,
    difficulty: req.difficulty ?? undefined,
    difficultyOverrides: req.difficultyOverrides,
    outRoot: OUT_ROOT,
    runId,
    overwrite: req.overwrite,
    baseUrl,
    allowRemote: false,
    platform: req.platform,
  };
}

async function executeJob(job: StudioJob, renderBaseUrl: string): Promise<void> {
  job.state = "running";
  const req = job.request;
  try {
    if (req.mode === "daily-package") {
      const prefix = req.runId ?? suggestRunId("daily");
      const result = await runDailyPackage(
        {
          runPrefix: prefix,
          featuredQuestionId: req.daily!.featuredQuestionId,
          challengeQuestionIds: req.questionIds,
          reuseFeaturedAsOpener: req.daily!.reuseFeaturedAsOpener,
          repeatVariant: req.challenge.repeatVariant,
          midCtaVariant: req.challenge.midCtaVariant,
          difficulty: req.difficulty ?? undefined,
          difficultyOverrides: req.difficultyOverrides,
          formats: parseFormats(req.formats.join(",")),
          outRoot: OUT_ROOT,
          overwrite: req.overwrite,
          baseUrl: renderBaseUrl,
          platform: req.platform,
        },
        jobHooks(job),
      );
      job.run_ids = result.posts.map((p) => p.runId);
      const totals = result.posts.reduce(
        (acc, p) => ({
          capture_count: acc.capture_count + p.result.captureCount,
          failure_count: acc.failure_count + p.result.failureCount,
          warning_count: acc.warning_count + p.result.warningCount,
        }),
        { capture_count: 0, failure_count: 0, warning_count: 0 },
      );
      job.result = totals;
      job.state =
        totals.failure_count > 0
          ? "failed"
          : totals.warning_count > 0
            ? "succeeded-with-warnings"
            : "succeeded";
    } else {
      const runId = req.runId ?? suggestRunId(req.mode);
      const result = await runGeneration(toGenerationRequest(req, runId, renderBaseUrl), jobHooks(job));
      job.run_ids = [result.runId];
      job.result = {
        capture_count: result.captureCount,
        failure_count: result.failureCount,
        warning_count: result.warningCount,
      };
      job.state = result.aborted
        ? "failed"
        : result.failureCount > 0
          ? "failed"
          : result.warningCount > 0
            ? "succeeded-with-warnings"
            : "succeeded";
      if (result.aborted) job.error = result.aborted;
    }
  } catch (err) {
    job.state = "failed";
    // Sanitized: message only, never a stack with env details.
    job.error = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
    job.log.push(`[error] ${job.error}`);
  } finally {
    job.finished_at = new Date().toISOString();
    activeJobId = null;
  }
}

// ── Question search (server-side proxy; the key never leaves this process) ──

type StudioQuestion = {
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

function toStudioQuestion(row: ScreenshotSourceQuestion): StudioQuestion {
  const adapted = adaptScreenshotQuestion(row);
  const ok = typeof adapted !== "string";
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const active = (row as Record<string, unknown>).is_active;
  return {
    id: row.id,
    prompt: row.question_text ?? "",
    category: row.category ?? null,
    choices: ok ? adapted.choices.map((c) => c.label) : [],
    correct_index: ok ? adapted.correct_index : null,
    correct_label: ok ? adapted.choices[adapted.correct_index]?.label ?? null : null,
    content_difficulty:
      typeof meta.content_difficulty === "string" ? meta.content_difficulty : null,
    question_type: typeof meta.question_type === "string" ? meta.question_type : null,
    is_active: typeof active === "boolean" ? active : active === 1 ? true : active === 0 ? false : null,
    compatible: ok,
    incompatible_reason: ok ? null : adapted,
  };
}

async function fetchQuestionById(id: string): Promise<StudioQuestion | null> {
  const api = apiBase();
  const key = adminKey();
  if (!api || !key) throw new Error("Backend not configured (VITE_COMBAT_API_URL / admin key env)");
  const res = await fetch(`${api}/api/quiz/admin/review/questions/${encodeURIComponent(id)}`, {
    headers: { "X-Admin-Key": key },
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  const payload = (await res.json()) as { ok?: boolean; question?: ScreenshotSourceQuestion };
  if (!payload.ok || !payload.question) return null;
  return toStudioQuestion(payload.question);
}

async function searchQuestions(params: URLSearchParams): Promise<StudioQuestion[]> {
  const api = apiBase();
  const key = adminKey();
  if (!api || !key) throw new Error("Backend not configured (VITE_COMBAT_API_URL / admin key env)");
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 25) || 25, 1), 50);
  const search = (params.get("search") ?? "").trim().toLowerCase().slice(0, 120);
  const category = (params.get("category") ?? "").trim().toLowerCase().slice(0, 60);
  const pack = (params.get("pack") ?? "").trim().slice(0, 80);

  const upstream = new URLSearchParams({ is_active: "1", page_size: "100" });
  if (pack && /^[A-Za-z0-9._-]+$/.test(pack)) upstream.set("pack_key", pack);
  const res = await fetch(`${api}/api/quiz/admin/review/questions?${upstream}`, {
    headers: { "X-Admin-Key": key },
  });
  if (!res.ok) throw new Error(`Backend ${res.status}`);
  const payload = (await res.json()) as { questions?: ScreenshotSourceQuestion[] };
  const rows = payload.questions ?? [];
  const out: StudioQuestion[] = [];
  for (const row of rows) {
    const text = (row.question_text ?? "").toLowerCase();
    if (search && !text.includes(search) && String(row.id) !== search) continue;
    if (category && (row.category ?? "").toLowerCase() !== category) continue;
    out.push(toStudioQuestion(row));
    if (out.length >= limit) break;
  }
  return out;
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  renderBaseUrl: string,
): Promise<void> {
  const origin = req.headers.origin;
  if (origin && LOOPBACK_ORIGIN_RE.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${STUDIO_HOST}:${STUDIO_PORT}`);
  if (!url.pathname.startsWith(API_PREFIX)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }
  const path = url.pathname.slice(API_PREFIX.length) || "/";
  const parts = path.split("/").filter(Boolean);

  try {
    // GET /health
    if (req.method === "GET" && parts[0] === "health") {
      sendJson(res, 200, {
        ok: true,
        backend_configured: !!(apiBase() && adminKey()),
        api_base: apiBase(),
        render_base_url: renderBaseUrl,
        active_job: activeJobId,
      });
      return;
    }

    // GET /questions[?id=|search=|category=|pack=|limit=]
    if (req.method === "GET" && parts[0] === "questions" && parts.length === 1) {
      const id = url.searchParams.get("id");
      if (id !== null) {
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
          sendJson(res, 400, { error: "Invalid question id" });
          return;
        }
        const q = await fetchQuestionById(id);
        if (!q) sendJson(res, 404, { error: `Question ${id} not found` });
        else sendJson(res, 200, { question: q });
        return;
      }
      sendJson(res, 200, { questions: await searchQuestions(url.searchParams) });
      return;
    }

    // GET /questions/:id
    if (req.method === "GET" && parts[0] === "questions" && parts.length === 2) {
      const id = parts[1];
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) {
        sendJson(res, 400, { error: "Invalid question id" });
        return;
      }
      const q = await fetchQuestionById(id);
      if (!q) sendJson(res, 404, { error: `Question ${id} not found` });
      else sendJson(res, 200, { question: q });
      return;
    }

    // POST /jobs
    if (req.method === "POST" && parts[0] === "jobs" && parts.length === 1) {
      if (activeJobId) {
        sendJson(res, 409, {
          error: "A generation job is already running",
          active_job: activeJobId,
        });
        return;
      }
      const body = await readBody(req);
      const validated = validateStudioJob(body);
      if (!validated.ok) {
        sendJson(res, 400, { error: "Invalid job request", details: validated.errors });
        return;
      }
      const job: StudioJob = {
        id: `job-${++jobCounter}-${Date.now()}`,
        state: "queued",
        mode: validated.request.mode,
        created_at: new Date().toISOString(),
        finished_at: null,
        log: [],
        request: validated.request,
        run_ids: [],
        result: null,
        error: null,
      };
      jobs.set(job.id, job);
      activeJobId = job.id;
      // Fire-and-track: the client polls GET /jobs/:id.
      void executeJob(job, renderBaseUrl);
      sendJson(res, 202, { job_id: job.id, state: job.state });
      return;
    }

    // GET /jobs/:id
    if (req.method === "GET" && parts[0] === "jobs" && parts.length === 2) {
      const job = jobs.get(parts[1]);
      if (!job) {
        sendJson(res, 404, { error: "Unknown job" });
        return;
      }
      sendJson(res, 200, {
        id: job.id,
        state: job.state,
        mode: job.mode,
        created_at: job.created_at,
        finished_at: job.finished_at,
        run_ids: job.run_ids,
        result: job.result,
        error: job.error,
        log: job.log.slice(-400),
      });
      return;
    }

    // GET /runs
    if (req.method === "GET" && parts[0] === "runs" && parts.length === 1) {
      sendJson(res, 200, {
        runs: listRuns(RUNS_ROOT),
        packages: listPackages(RUNS_ROOT),
      });
      return;
    }

    // GET /runs/:runId
    if (req.method === "GET" && parts[0] === "runs" && parts.length === 2) {
      if (!isValidRunId(parts[1])) {
        sendJson(res, 400, { error: "Invalid run id" });
        return;
      }
      const detail = getRunDetail(RUNS_ROOT, parts[1]);
      if (!detail) sendJson(res, 404, { error: "Run not found" });
      else sendJson(res, 200, detail);
      return;
    }

    // GET /runs/:runId/zip
    if (req.method === "GET" && parts[0] === "runs" && parts.length === 3 && parts[2] === "zip") {
      const detail = getRunDetail(RUNS_ROOT, parts[1]);
      if (!detail) {
        sendJson(res, 404, { error: "Run not found" });
        return;
      }
      const zip = new JSZip();
      for (const rel of detail.images) {
        const abs = safeRunFilePath(RUNS_ROOT, parts[1], rel);
        if (abs) zip.file(rel, readFileSync(abs));
      }
      const buf = await zip.generateAsync({ type: "nodebuffer" });
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${parts[1]}.zip"`,
      });
      res.end(buf);
      return;
    }

    // GET /runs/:runId/files/<rel path> — the ONLY file-serving route.
    if (req.method === "GET" && parts[0] === "runs" && parts.length >= 4 && parts[2] === "files") {
      const rel = parts.slice(3).join("/");
      const abs = safeRunFilePath(RUNS_ROOT, parts[1], rel);
      if (!abs) {
        sendJson(res, 400, { error: "Invalid file path" });
        return;
      }
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        sendJson(res, 404, { error: "File not found" });
        return;
      }
      if (!stat.isFile()) {
        sendJson(res, 404, { error: "File not found" });
        return;
      }
      const ext = abs.slice(abs.lastIndexOf(".")).toLowerCase();
      res.writeHead(200, {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Length": stat.size,
        "Cache-Control": "no-store",
      });
      res.end(readFileSync(abs));
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    // Sanitized error surface — no stacks, no env, no key material.
    const msg = err instanceof Error ? err.message.slice(0, 300) : "Internal error";
    sendJson(res, 500, { error: msg });
  }
}

// ── Startup ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("Content Post Studio — local server");
  if (!adminKey()) {
    console.warn(
      "WARNING: no ADMIN_KEY / KNOWLEDGE_ADMIN_KEY in this environment — question search and generation will fail until it is set.",
    );
  }
  if (!apiBase()) {
    console.warn(
      "WARNING: no VITE_COMBAT_API_URL (env or .env) — set it to your local backend, e.g. http://127.0.0.1:8000",
    );
  }

  // One shared render/UI dev server: serves BOTH the screenshot harness and
  // the /dev/content-studio page.
  const render: ManagedServer = await ensureServer(process.env.CONTENT_STUDIO_BASE_URL);

  const server = createServer((req, res) => {
    void handle(req, res, render.baseUrl);
  });
  server.listen(STUDIO_PORT, STUDIO_HOST, () => {
    console.log(`\nStudio API:  http://${STUDIO_HOST}:${STUDIO_PORT}${API_PREFIX}`);
    console.log(`Studio UI:   ${render.baseUrl}/dev/content-studio`);
    console.log(`Output root: ${join(OUT_ROOT, "runs")}\n`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} — shutting down...`);
    server.close();
    await render.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
