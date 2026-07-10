/**
 * Prepare a Remotion-ready quiz video input JSON from REAL Mogsy quiz data.
 *
 *   npm run video:prepare -- --favorites --limit 5
 *   npm run video:prepare -- --category item_exact_stats --difficulty-max 2
 *   npm run video:prepare -- --pack <pack_key> --title "Item Quiz #1"
 *   npm run video:prepare -- --in exported-questions.json     # offline file
 *
 * Then render it:
 *
 *   npm run video:render -- --props out/quiz-video-input.json
 *
 * Source: the Quiz Review Console endpoint
 *   GET {api}/api/quiz/admin/review/questions   (X-Admin-Key required)
 * — the only quiz read that returns correct answers + explanations inline
 * (the public playlist endpoint hides them). Read-only; nothing is written
 * to the backend.
 *
 * Admin key resolution: --admin-key flag, else ADMIN_KEY / KNOWLEDGE_ADMIN_KEY
 * env var. API base: --api flag, else VITE_COMBAT_API_URL env var, else the
 * value in the repo's .env file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { adaptQuestions, type SourceQuestion } from "../src/video/adapter";
import { buildTimeline, formatTimestamp } from "../src/video/timing";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

function envFromDotEnv(name: string): string | undefined {
  try {
    const env = readFileSync(resolve(".env"), "utf8");
    const m = env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m"));
    return m?.[1];
  } catch {
    return undefined;
  }
}

async function loadQuestions(): Promise<SourceQuestion[]> {
  // ── Offline path: adapt a local JSON file (array or {questions: [...]}) ──
  const inPath = arg("--in");
  if (inPath) {
    const raw = JSON.parse(readFileSync(resolve(inPath), "utf8"));
    const questions = Array.isArray(raw) ? raw : raw.questions;
    if (!Array.isArray(questions)) {
      throw new Error(`${inPath} must be a question array or contain a "questions" array`);
    }
    console.log(`Loaded ${questions.length} question(s) from ${inPath}`);
    return questions as SourceQuestion[];
  }

  // ── Live path: Quiz Review Console (read-only, admin key required) ──────
  const api = (arg("--api") ?? process.env.VITE_COMBAT_API_URL ?? envFromDotEnv("VITE_COMBAT_API_URL"))
    ?.replace(/\/+$/, "");
  if (!api) throw new Error("No API base URL. Pass --api or set VITE_COMBAT_API_URL.");

  const adminKey = arg("--admin-key") ?? process.env.ADMIN_KEY ?? process.env.KNOWLEDGE_ADMIN_KEY;
  if (!adminKey) {
    throw new Error(
      "No admin key. Pass --admin-key <key> or set ADMIN_KEY / KNOWLEDGE_ADMIN_KEY.\n" +
        "(The public quiz API hides correct answers, so the export reads the admin review endpoint.)",
    );
  }

  const params = new URLSearchParams();
  params.set("is_active", "1");
  // Fetch extra so the adapter can drop unusable rows and still hit --limit.
  const limit = Number(arg("--limit") ?? 5);
  params.set("page_size", String(Math.min(Math.max(limit * 3, 20), 100)));
  if (arg("--category")) params.set("category", arg("--category")!);
  if (arg("--pack")) params.set("pack_key", arg("--pack")!);
  if (arg("--difficulty-min")) params.set("difficulty_min", arg("--difficulty-min")!);
  if (arg("--difficulty-max")) params.set("difficulty_max", arg("--difficulty-max")!);
  if (arg("--review-status")) params.set("review_status", arg("--review-status")!);
  if (has("--favorites")) params.set("favorite_for_shorts", "1");

  const url = `${api}/api/quiz/admin/review/questions?${params}`;
  console.log(`Fetching ${url}`);
  const res = await fetch(url, { headers: { "X-Admin-Key": adminKey } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Quiz admin API ${res.status}: ${body || res.statusText}`);
  }
  const payload = (await res.json()) as { total?: number; questions?: SourceQuestion[] };
  const questions = payload.questions ?? [];
  console.log(`Fetched ${questions.length} question(s) (total matching: ${payload.total ?? "?"})`);
  return questions;
}

/**
 * Fetch the public champion asset manifest so the broadcast ScenarioCard
 * components can resolve splash art during the render WITHOUT any network
 * fetch inside Remotion. Failure is non-fatal: cards fall back to gradients.
 */
async function loadChampionManifest(): Promise<unknown | null> {
  const api = (arg("--api") ?? process.env.VITE_COMBAT_API_URL ?? envFromDotEnv("VITE_COMBAT_API_URL"))
    ?.replace(/\/+$/, "");
  if (!api) return null;
  try {
    const res = await fetch(`${api}/api/assets/champions`, { headers: { accept: "application/json" } });
    if (!res.ok) {
      console.warn(`Champion manifest fetch failed (${res.status}) — splash art will use fallbacks.`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`Champion manifest fetch failed (${err instanceof Error ? err.message : err}) — splash art will use fallbacks.`);
    return null;
  }
}

async function main() {
  const outPath = resolve(arg("--out") ?? "out/quiz-video-input.json");
  const limit = Number(arg("--limit") ?? 5);

  const questions = await loadQuestions();
  const { data, skipped } = adaptQuestions(questions, {
    limit,
    title: arg("--title"),
    subtitle: arg("--subtitle"),
    patch: arg("--patch"),
    website: arg("--website"),
  });

  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} question(s):`);
    for (const s of skipped) console.log(`  - #${s.id}: ${s.reason}`);
  }
  if (!data.questions.length) {
    console.error("\nNo usable questions after adaptation — nothing written.");
    process.exit(1);
  }

  // Embed the champion manifest so Remotion renders fetch nothing.
  const manifest = await loadChampionManifest();
  if (manifest) data.champion_manifest = manifest;

  // Embed the API base so relative asset paths (metadata icons, manifest
  // splashes) resolve inside the Remotion bundle, which has no import.meta.env.
  const assetBase = (arg("--api") ?? process.env.VITE_COMBAT_API_URL ?? envFromDotEnv("VITE_COMBAT_API_URL"))
    ?.replace(/\/+$/, "");
  if (assetBase) data.asset_base_url = assetBase;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

  const timeline = buildTimeline(data);
  console.log(`\nWrote ${outPath}`);
  console.log(
    `${data.questions.length} question(s) → video length ${formatTimestamp(timeline.totalSeconds)} @ ${timeline.fps}fps`,
  );
  console.log(`\nRender it:\n  npm run video:render -- --props ${outPath.includes(" ") ? `"${outPath}"` : outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
