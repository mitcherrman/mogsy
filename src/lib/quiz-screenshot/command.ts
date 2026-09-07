/**
 * CON1 Step 2 — the Admin → Content Factory command builder. PURE: no React,
 * no DOM, no fetch, no fs.
 *
 * WHY IT EXISTS
 * Deployed Admin cannot spawn Playwright, write export files, run the local
 * screenshot server or browse run history. So Admin owns discovery, review,
 * readiness and SELECTION, and hands off a deterministic command; the local
 * Content Factory keeps the engine. That is the shape `AdminVideoExport` +
 * `src/lib/video-export/commands.ts` already established, and this is the same
 * pattern for `npm run quiz:screenshots`.
 *
 * WHY IT SITS BESIDE `cli.ts`
 * `cli.ts` is the PARSER for exactly the argv this module emits. A builder that
 * lives anywhere else drifts from its parser the first time a flag changes, and
 * the operator finds out by pasting a command that dies. Here they share a
 * directory, and `command.parser.test.ts` feeds every built argv through
 * `parseScreenshotCli` so a drift fails the suite instead of the terminal.
 *
 * WHAT IT WILL NEVER EMIT (see `NEVER_EMITTED_FLAGS`)
 *   --admin-key / --api / --base-url   secrets and environment, which belong in
 *                                      the operator's own env, never in a
 *                                      string Admin puts on a clipboard
 *   --allow-incomplete-presentation    Step 1D/1E DIAGNOSTIC escape hatches.
 *   --allow-missing-assets             Normal publishing must fail closed; a
 *                                      readiness preflight that then hands over
 *                                      a command waiving the very gate it
 *                                      checked would be worse than no check.
 *
 * Every vocabulary below is imported from the registry that owns it —
 * `./formats`, `./types`, `./content-posts`, `./difficulty`, `./cli` — so there
 * is no Admin-only copy of the strings `landscape`, `square`, `question`, …
 */

import { quoteArg } from "@/lib/cli/shellQuote";
import { FORMAT_KEYS, getFormat } from "./formats";
import { isRenderState } from "./states";
import { RENDER_STATES, type RenderState } from "./types";
import { POST_TYPES, isPostType, type PostType } from "./content-posts";
import { DIFFICULTY_TIERS, isDifficultyTier, type DifficultyTier } from "./difficulty";
import {
  DEFAULT_FORMAT_KEYS,
  DEFAULT_STATES,
  MAX_BATCH_LIMIT,
} from "./cli";
// The run-id grammar has ONE owner — the local studio server's own validator.
// A second literal here is how "valid in Admin, rejected locally" happens.
import { RUN_ID_RE } from "./studio-request";

/** The npm script the local Content Factory runner is invoked through. */
export const CONTENT_COMMAND_SCRIPT = "npm run quiz:screenshots";

/**
 * Flags this builder must never put in an operator-visible command.
 *
 * Asserted as a set rather than trusted to review: a later contributor adding
 * "just an --api for convenience" trips `command.test.ts`.
 */
export const NEVER_EMITTED_FLAGS: readonly string[] = [
  "--admin-key",
  "--api",
  "--base-url",
  "--allow-remote",
  "--allow-incomplete-presentation",
  "--allow-missing-assets",
] as const;

export type ContentCommandConfig = {
  /**
   * The selected STORED question ids, in the order Admin selected them.
   *
   * Order is preserved, never re-sorted: a carousel post is an ordered
   * sequence, so silently reordering the selection would change the artefact.
   */
  questionIds: ReadonlyArray<number | string>;
  /** Format registry keys (`./formats`). */
  formats: readonly string[];
  /** Render states (`./types`). Ignored — and not emitted — when `post` is set,
   *  because the CLI rejects `--post` combined with `--states`. */
  states: readonly RenderState[];
  /** Carousel post type; defines its own slide sequence. */
  post?: PostType | null;
  /** Run-level difficulty/rank badge override. */
  difficulty?: DifficultyTier | null;
  /** Named run directory. */
  runId?: string | null;
  /** Allow replacing an existing run directory. */
  overwrite?: boolean;
};

export const DEFAULT_CONTENT_COMMAND_CONFIG: ContentCommandConfig = {
  questionIds: [],
  formats: DEFAULT_FORMAT_KEYS,
  states: DEFAULT_STATES,
  post: null,
  difficulty: null,
  runId: null,
  overwrite: false,
};

export type BuiltContentCommand = {
  /**
   * The argv the runner receives, exactly as `parseScreenshotCli` takes it.
   * Empty when `errors` is non-empty — a partially valid command is never
   * offered.
   */
  args: string[];
  /** The full copyable line, or "" when the config could not produce one. */
  command: string;
  /** Why no command could be built. Empty on success. */
  errors: string[];
};

const EMPTY: BuiltContentCommand = { args: [], command: "", errors: [] };

/** One selected id, normalized to the string the CLI will see. */
function normalizeId(id: number | string): string {
  return typeof id === "number" ? String(id) : id.trim();
}

/**
 * Validate + normalize the selected ids.
 *
 * `--question-ids` is a comma-separated list, so an id containing a comma
 * cannot survive the round trip and is rejected here rather than silently
 * splitting into two ids that address different questions.
 */
function normalizeIds(ids: ReadonlyArray<number | string>, errors: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = normalizeId(raw);
    if (!id) {
      errors.push("A selected question has an empty id.");
      continue;
    }
    if (id.includes(",")) {
      errors.push(`Question id "${id}" contains a comma and cannot be passed on the CLI.`);
      continue;
    }
    if (seen.has(id)) continue; // selection is a set; a repeat is not an error
    seen.add(id);
    out.push(id);
  }
  if (!out.length) errors.push("Select at least one question.");
  if (out.length > MAX_BATCH_LIMIT) {
    errors.push(
      `${out.length} questions selected — the runner's maximum is ${MAX_BATCH_LIMIT}. ` +
        `Generate them in smaller batches.`,
    );
  }
  return out;
}

/**
 * Build the exact local command for a content configuration.
 *
 * Deterministic: the same config always yields the same argv, in this flag
 * order — source, post/states, formats, difficulty, run id, overwrite.
 */
export function buildContentCommand(config: ContentCommandConfig): BuiltContentCommand {
  const errors: string[] = [];
  const ids = normalizeIds(config.questionIds ?? [], errors);

  // ── Formats ────────────────────────────────────────────────────────────
  const formats: string[] = [];
  const seenFormat = new Set<string>();
  for (const key of config.formats ?? []) {
    const k = (key ?? "").trim();
    if (!k || seenFormat.has(k)) continue;
    if (!getFormat(k)) {
      errors.push(`Unknown format "${k}". Valid formats: ${FORMAT_KEYS.join(", ")}`);
      continue;
    }
    seenFormat.add(k);
    formats.push(k);
  }
  if (!formats.length) errors.push("Select at least one format.");

  // ── Post type (mutually exclusive with an explicit --states) ───────────
  let post: PostType | null = null;
  if (config.post) {
    if (!isPostType(config.post)) {
      errors.push(`Unknown post type "${config.post}". Valid: ${POST_TYPES.join(", ")}`);
    } else {
      post = config.post;
    }
  }

  // ── States (only when there is no post) ────────────────────────────────
  const states: RenderState[] = [];
  if (!post) {
    const seenState = new Set<string>();
    for (const s of config.states ?? []) {
      const v = (s ?? "").trim() as RenderState;
      if (!v || seenState.has(v)) continue;
      if (!isRenderState(v)) {
        errors.push(`Unknown state "${v}". Valid states: ${RENDER_STATES.join(", ")}`);
        continue;
      }
      seenState.add(v);
      states.push(v);
    }
    if (!states.length) errors.push("Select at least one render state.");
  }

  // ── Difficulty ─────────────────────────────────────────────────────────
  let difficulty: DifficultyTier | null = null;
  if (config.difficulty) {
    if (!isDifficultyTier(config.difficulty)) {
      errors.push(
        `Unknown difficulty "${config.difficulty}". Valid tiers: ${DIFFICULTY_TIERS.join(", ")}`,
      );
    } else {
      difficulty = config.difficulty;
    }
  }

  // ── Run id ─────────────────────────────────────────────────────────────
  let runId: string | null = null;
  const rawRunId = (config.runId ?? "").trim();
  if (rawRunId) {
    if (!RUN_ID_RE.test(rawRunId)) {
      errors.push(
        `Invalid run name "${rawRunId}" — use 1-64 letters, digits, hyphens or ` +
          `underscores (no paths).`,
      );
    } else {
      runId = rawRunId;
    }
  }

  if (errors.length) return { ...EMPTY, errors };

  const args: string[] = [];
  if (ids.length === 1) args.push("--question-id", ids[0]);
  else args.push("--question-ids", ids.join(","));
  if (post) args.push("--post", post);
  else args.push("--states", states.join(","));
  args.push("--formats", formats.join(","));
  if (difficulty) args.push("--difficulty", difficulty);
  if (runId) args.push("--run-id", runId);
  if (config.overwrite) args.push("--overwrite");

  return {
    args,
    command: `${CONTENT_COMMAND_SCRIPT} -- ${args.map(quoteArg).join(" ")}`,
    errors: [],
  };
}
