/**
 * Strict CLI argument parsing for the screenshot runner. Pure module so the
 * validation rules are unit-testable; the runner (scripts/quiz-screenshots)
 * feeds it process.argv.slice(2).
 */
import { DEFAULT_EXPORT_ROOT, assertSafeExportRoot } from "./paths";
import { parseFormats, FORMAT_KEYS } from "./formats";
import { parseStates } from "./states";
import { RENDER_STATES, type RenderState } from "./types";
import type { RenderFormat } from "./types";
import { POST_TYPES, isPostType, type PostType } from "./content-posts";
import { DIFFICULTY_TIERS, isDifficultyTier, type DifficultyTier } from "./difficulty";

// Content-first defaults: a content run needs the unanswered hook + the
// reveal, in the primary mobile-social format. All other states/formats
// (including the audit modes) remain available via --states / --formats.
export const DEFAULT_STATES: RenderState[] = ["question", "correct"];
export const DEFAULT_FORMAT_KEYS = ["mobile-social"];
export const DEFAULT_BATCH_LIMIT = 10;
export const MAX_BATCH_LIMIT = 100;

export type ScreenshotCliConfig = {
  /** Report-only recovery mode: rebuild reports for this existing run id
   *  (no capture, no server, no backend). When set, `source` is unused. */
  finalizeRun?: string;
  source:
    | { mode: "question-id"; ids: string[] }
    | { mode: "pack"; packKey: string; limit: number }
    | { mode: "approved"; limit: number }
    | { mode: "fixture"; path: string; limit: number };
  states: RenderState[];
  formats: RenderFormat[];
  /** Carousel post type — expands into an ordered slide sequence per question.
   *  When set, `states` is ignored (each post defines its own slide states). */
  post?: PostType;
  /** Run-level difficulty/rank override (iron|gold|diamond); else per-question
   *  metadata.content_difficulty, else no badge. */
  difficulty?: DifficultyTier;
  answerIndex?: number;
  outRoot: string;
  runId?: string;
  overwrite: boolean;
  baseUrl?: string;
  allowRemote: boolean;
  api?: string;
  adminKey?: string;
};

const VALUE_FLAGS = new Set([
  "--finalize-run",
  "--question-id",
  "--question-ids",
  "--pack",
  "--fixture",
  "--limit",
  "--states",
  "--formats",
  "--post",
  "--difficulty",
  "--answer-index",
  "--out",
  "--run-id",
  "--base-url",
  "--api",
  "--admin-key",
]);
const BOOL_FLAGS = new Set(["--approved", "--overwrite", "--allow-remote"]);

export function parseScreenshotCli(argv: string[]): ScreenshotCliConfig {
  const values = new Map<string, string>();
  const bools = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (BOOL_FLAGS.has(a)) {
      bools.add(a);
      continue;
    }
    if (VALUE_FLAGS.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`Flag ${a} requires a value`);
      if (values.has(a)) throw new Error(`Flag ${a} given more than once`);
      values.set(a, v);
      i++;
      continue;
    }
    throw new Error(`Unknown argument "${a}". See scripts/quiz-screenshots/README.md`);
  }

  // ── Report-only recovery mode ──────────────────────────────────────────
  if (values.has("--finalize-run")) {
    const runId = values.get("--finalize-run")!.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9-_]{0,63}$/.test(runId)) {
      throw new Error(
        `Invalid --finalize-run id "${runId}" — use 1-64 letters, digits, hyphens, or underscores (no paths)`,
      );
    }
    const allowed = new Set(["--finalize-run", "--out"]);
    for (const flag of values.keys()) {
      if (!allowed.has(flag)) {
        throw new Error(`--finalize-run only accepts --out and --overwrite (got ${flag})`);
      }
    }
    for (const flag of bools) {
      if (flag !== "--overwrite") {
        throw new Error(`--finalize-run only accepts --out and --overwrite (got ${flag})`);
      }
    }
    const outRoot = values.get("--out") ?? DEFAULT_EXPORT_ROOT;
    assertSafeExportRoot(outRoot);
    return {
      finalizeRun: runId,
      source: { mode: "fixture", path: "(unused)", limit: DEFAULT_BATCH_LIMIT },
      states: DEFAULT_STATES,
      formats: parseFormats(DEFAULT_FORMAT_KEYS.join(",")),
      outRoot,
      overwrite: bools.has("--overwrite"),
      allowRemote: false,
    };
  }

  // ── Source selection: exactly one ──────────────────────────────────────
  const sources = [
    values.has("--question-id") ? "--question-id" : null,
    values.has("--question-ids") ? "--question-ids" : null,
    values.has("--pack") ? "--pack" : null,
    bools.has("--approved") ? "--approved" : null,
    values.has("--fixture") ? "--fixture" : null,
  ].filter(Boolean) as string[];
  if (sources.length === 0) {
    throw new Error(
      "No question source. Use one of --question-id, --question-ids, --pack, --approved, --fixture",
    );
  }
  if (sources.length > 1) {
    throw new Error(`Conflicting question sources: ${sources.join(", ")} — use exactly one`);
  }

  let limit = DEFAULT_BATCH_LIMIT;
  if (values.has("--limit")) {
    limit = Number(values.get("--limit"));
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`--limit must be a positive integer (got "${values.get("--limit")}")`);
    }
    if (limit > MAX_BATCH_LIMIT) {
      throw new Error(`--limit ${limit} exceeds the safety maximum of ${MAX_BATCH_LIMIT}`);
    }
  }

  let source: ScreenshotCliConfig["source"];
  if (values.has("--question-id")) {
    const id = values.get("--question-id")!.trim();
    if (!id) throw new Error("--question-id must not be empty");
    source = { mode: "question-id", ids: [id] };
  } else if (values.has("--question-ids")) {
    const ids = values
      .get("--question-ids")!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) throw new Error("--question-ids must contain at least one id");
    if (new Set(ids).size !== ids.length) throw new Error("--question-ids contains duplicates");
    if (ids.length > MAX_BATCH_LIMIT) {
      throw new Error(`--question-ids lists ${ids.length} ids — maximum is ${MAX_BATCH_LIMIT}`);
    }
    source = { mode: "question-id", ids };
  } else if (values.has("--pack")) {
    source = { mode: "pack", packKey: values.get("--pack")!.trim(), limit };
  } else if (bools.has("--approved")) {
    source = { mode: "approved", limit };
  } else {
    source = { mode: "fixture", path: values.get("--fixture")!, limit };
  }

  // Carousel post type — defines its own slide sequence, so it is mutually
  // exclusive with an explicit --states selection.
  let post: PostType | undefined;
  if (values.has("--post")) {
    const raw = values.get("--post")!.trim();
    if (!isPostType(raw)) {
      throw new Error(`Unknown --post "${raw}". Valid post types: ${POST_TYPES.join(", ")}`);
    }
    if (values.has("--states")) {
      throw new Error("--post defines its own slides — do not combine it with --states");
    }
    post = raw;
  }

  let difficulty: DifficultyTier | undefined;
  if (values.has("--difficulty")) {
    const raw = values.get("--difficulty")!.trim().toLowerCase();
    if (!isDifficultyTier(raw)) {
      throw new Error(
        `Unknown --difficulty "${raw}". Valid tiers: ${DIFFICULTY_TIERS.join(", ")}`,
      );
    }
    difficulty = raw;
  }

  const states = values.has("--states")
    ? parseStates(values.get("--states")!)
    : DEFAULT_STATES;
  const formats = values.has("--formats")
    ? parseFormats(values.get("--formats")!)
    : parseFormats(DEFAULT_FORMAT_KEYS.join(","));

  let answerIndex: number | undefined;
  if (values.has("--answer-index")) {
    answerIndex = Number(values.get("--answer-index"));
    if (!Number.isInteger(answerIndex) || answerIndex < 0) {
      throw new Error(`--answer-index must be a non-negative integer`);
    }
  }

  const outRoot = values.get("--out") ?? DEFAULT_EXPORT_ROOT;
  assertSafeExportRoot(outRoot);

  const allowRemote = bools.has("--allow-remote");
  const baseUrl = values.get("--base-url");
  if (baseUrl && !allowRemote) {
    let host: string;
    try {
      host = new URL(baseUrl).hostname;
    } catch {
      throw new Error(`--base-url "${baseUrl}" is not a valid URL`);
    }
    if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
      throw new Error(
        `--base-url host "${host}" is not local. Screenshot capture defaults to local; pass --allow-remote to override deliberately.`,
      );
    }
  }

  return {
    source,
    states,
    formats,
    post,
    difficulty,
    answerIndex,
    outRoot,
    runId: values.get("--run-id"),
    overwrite: bools.has("--overwrite"),
    baseUrl,
    allowRemote,
    api: values.get("--api"),
    adminKey: values.get("--admin-key"),
  };
}

export const CLI_USAGE = `Usage: npm run quiz:screenshots -- <source> [options]

Sources (exactly one):
  --question-id <id>            One question by id
  --question-ids <id,id,...>    Multiple explicit ids
  --pack <pack_key>             One quiz pack (bounded by --limit)
  --approved                    Bounded batch of active questions (--limit, default ${DEFAULT_BATCH_LIMIT})
  --fixture <file.json>         Local question dump (offline)
  --finalize-run <run-id>       Report-only recovery: rebuild summary.json,
                                failures.json, index.html for an existing run
                                (no capture, no server, no backend; only --out
                                and --overwrite may accompany it)

Options:
  --states <csv>                ${RENDER_STATES.join(",")} (default: ${DEFAULT_STATES.join(",")})
  --formats <csv>               ${FORMAT_KEYS.join(",")} (default: ${DEFAULT_FORMAT_KEYS.join(",")})
  --post <type>                 Carousel post: ${POST_TYPES.join(" | ")} (expands into ordered slides; not with --states)
  --difficulty <tier>           Rank/difficulty badge: ${DIFFICULTY_TIERS.join(" | ")} (else per-question metadata)
  --answer-index <n>            Override deterministic selection for selected/incorrect
  --limit <n>                   Batch cap (default ${DEFAULT_BATCH_LIMIT}, max ${MAX_BATCH_LIMIT})
  --out <dir>                   Output root (default ${DEFAULT_EXPORT_ROOT}, relative, never public/ or src/)
  --run-id <name>               Named run directory (default: timestamp); refuses to overwrite unless --overwrite
  --overwrite                   Allow replacing an existing run directory
  --base-url <url>              Reuse a running local server instead of starting one
  --allow-remote                Permit a non-localhost --base-url (deliberate override)
  --api <url>                   Backend base for question data (default VITE_COMBAT_API_URL / .env)
  --admin-key <key>             Admin key (default ADMIN_KEY / KNOWLEDGE_ADMIN_KEY env)
`;
