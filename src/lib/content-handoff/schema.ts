/**
 * CON1 Step 3A — the Admin → local Content Workspace handoff contract.
 *
 * PURE module: no React, no DOM, no fetch, no fs. It is imported by BOTH
 * sides of the handoff —
 *
 *   Admin Quiz Review  (`GenerateContentPanel`) serializes a selection
 *   Content Workspace  (`/dev/content-studio`)  parses and seeds itself
 *
 * — so there is exactly one definition of what a handoff is, and a change to
 * it cannot land on one side only.
 *
 * WHY A SEPARATE MODEL FROM `ContentCommandConfig`
 * It is not separate: `contentHandoffFromCommandConfig` is the ONE conversion,
 * and everything it emits is a subset of what both consumers already accept —
 * `parseScreenshotCli` (the CLI) and `validateStudioJob` (the local Studio
 * server). The handoff exists so the same selection can travel by URL or by
 * clipboard instead of only as a shell string.
 *
 * IMPORT STYLE
 * Relative (`../quiz-screenshot/...`), not the `@/` alias, deliberately: the
 * loopback constants beside this file are imported by `scripts/` under tsx,
 * which resolves no vite alias. Every module this one reaches is alias-free
 * for the same reason, so a handoff stays readable from node as well as from
 * the browser bundle.
 *
 * VOCABULARY OWNERSHIP
 * Every enum below is imported from the registry that owns it — `./formats`,
 * `./types`, `./content-posts`, `./difficulty`, `./cli` — and the id/run-id
 * shapes come from `./studio-request`, the local server's own validator. There
 * is no handoff-only copy of the strings `landscape`, `question`, `gold`, and
 * no handoff-only idea of what a legal run name is.
 *
 * WHAT A HANDOFF CAN NEVER CARRY (`HANDOFF_FORBIDDEN_KEYS`)
 *   adminKey / api / baseUrl / allowRemote   secrets and environment, which
 *                                            live in the operator's own env
 *   allowIncompletePresentation              Step 1D/1E DIAGNOSTIC overrides.
 *   allowMissingAssets                       A handoff that waived the runtime
 *                                            gates would make the readiness
 *                                            preflight a lie.
 * A payload naming any of them is REJECTED rather than stripped: silently
 * dropping a field an operator (or a script) believed was honoured is how a
 * capture ends up running with a gate the operator thought was on.
 */

import { FORMAT_KEYS, getFormat } from "../quiz-screenshot/formats";
import { RENDER_STATES, type RenderState } from "../quiz-screenshot/types";
import { isRenderState } from "../quiz-screenshot/states";
import { POST_TYPES, isPostType, type PostType } from "../quiz-screenshot/content-posts";
import {
  DIFFICULTY_TIERS,
  isDifficultyTier,
  type DifficultyTier,
} from "../quiz-screenshot/difficulty";
import {
  DEFAULT_FORMAT_KEYS,
  DEFAULT_STATES,
  MAX_BATCH_LIMIT,
} from "../quiz-screenshot/cli";
import {
  QUESTION_ID_RE,
  RUN_ID_RE,
  type StudioModeKey,
} from "../quiz-screenshot/studio-request";
import type { ContentCommandConfig } from "../quiz-screenshot/command";

/** Wire version. Bumped only for a breaking change to the field set. */
export const CONTENT_HANDOFF_VERSION = 1;

/**
 * Keys a handoff must never carry, asserted as a set rather than trusted to
 * review. Matched case-insensitively against both the camelCase object form
 * and the query-string form, so `--admin-key`, `adminKey` and `admin_key`
 * are all refused.
 */
export const HANDOFF_FORBIDDEN_KEYS: readonly string[] = [
  "adminkey",
  "apikey",
  "api",
  "baseurl",
  "allowremote",
  "allowincompletepresentation",
  "allowmissingassets",
  "token",
  "secret",
  "password",
] as const;

/**
 * The handoff itself: an ordered selection plus the configuration Admin chose
 * first. Everything here is a SEED — the local workspace owns the final
 * generation configuration (see CONTENT_FACTORY_HANDOFF.md, Step 3A).
 */
export type ContentHandoff = {
  version: typeof CONTENT_HANDOFF_VERSION;
  /** Ordered, deduped question ids. Order is the artefact's order. */
  questionIds: string[];
  /** Format registry keys. */
  formats: string[];
  /** Carousel post type, or null meaning "capture explicit render states". */
  post: PostType | null;
  /** Render states. Empty when `post` is set — the CLI rejects the pair. */
  states: RenderState[];
  difficulty: DifficultyTier | null;
  runId: string | null;
  overwrite: boolean;
};

export type ContentHandoffResult =
  | { ok: true; handoff: ContentHandoff }
  | { ok: false; errors: string[] };

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const normalizeKey = (k: string): string => k.replace(/[-_]/g, "").toLowerCase();

/** Names in `raw` that a handoff is not allowed to carry. */
export function forbiddenKeysIn(raw: unknown): string[] {
  const rec = asRecord(raw);
  if (!rec) return [];
  return Object.keys(rec).filter((k) => HANDOFF_FORBIDDEN_KEYS.includes(normalizeKey(k)));
}

function normalizeList(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    if (value.some((v) => typeof v !== "string" && typeof v !== "number")) return null;
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return null;
}

/**
 * Validate an untrusted handoff payload — a parsed JSON object, or the record
 * `decodeContentHandoffParams` builds out of a query string. Both intake paths
 * land here, so a rule cannot apply to one and not the other.
 */
export function validateContentHandoff(raw: unknown): ContentHandoffResult {
  const errors: string[] = [];
  const b = asRecord(raw);
  if (!b) return { ok: false, errors: ["Handoff payload must be a JSON object"] };

  const forbidden = forbiddenKeysIn(b);
  if (forbidden.length) {
    return {
      ok: false,
      errors: [
        `Handoff payload carries forbidden field(s): ${forbidden.join(", ")}. ` +
          `Credentials, backend URLs and the diagnostic gate overrides never travel in a handoff.`,
      ],
    };
  }

  // ── Version ────────────────────────────────────────────────────────────
  const rawVersion = b.version ?? b.v;
  if (rawVersion !== undefined && rawVersion !== null && rawVersion !== "") {
    const n = typeof rawVersion === "string" ? Number(rawVersion) : rawVersion;
    if (typeof n !== "number" || !Number.isInteger(n)) {
      errors.push(`Unreadable handoff version "${String(rawVersion)}"`);
    } else if (n !== CONTENT_HANDOFF_VERSION) {
      errors.push(
        `Handoff version ${n} is not supported (this workspace speaks v${CONTENT_HANDOFF_VERSION})`,
      );
    }
  }

  // ── Question ids — ordered, deduped, shape-checked ─────────────────────
  const rawIds = normalizeList(b.questionIds ?? b.ids);
  const questionIds: string[] = [];
  if (rawIds === null) {
    errors.push("questionIds must be an array of ids or a comma-separated list");
  } else {
    const seen = new Set<string>();
    for (const id of rawIds) {
      if (!QUESTION_ID_RE.test(id)) {
        errors.push(`Invalid question id "${id}"`);
        continue;
      }
      if (seen.has(id)) continue; // a selection is a set; a repeat is not an error
      seen.add(id);
      questionIds.push(id);
    }
    if (!questionIds.length && !errors.length) errors.push("Handoff selects no questions");
    if (questionIds.length > MAX_BATCH_LIMIT) {
      errors.push(
        `Handoff selects ${questionIds.length} questions — the runner's maximum is ${MAX_BATCH_LIMIT}`,
      );
    }
  }

  // ── Formats. Absent means the RUNNER's own default, so a minimal handoff
  //    (`?ids=41`) means exactly what a minimal command means. ─────────────
  const formats: string[] = [];
  const formatsGiven = b.formats !== undefined;
  const rawFormats = formatsGiven ? normalizeList(b.formats) : [...DEFAULT_FORMAT_KEYS];
  if (rawFormats === null) {
    errors.push("formats must be an array or comma-separated list of format keys");
  } else {
    const seen = new Set<string>();
    for (const key of rawFormats) {
      if (seen.has(key)) continue;
      if (!getFormat(key)) {
        errors.push(`Unknown format "${key}". Valid formats: ${FORMAT_KEYS.join(", ")}`);
        continue;
      }
      seen.add(key);
      formats.push(key);
    }
    if (!formats.length && !errors.length) errors.push("Handoff names no usable format");
  }

  // ── Post type ──────────────────────────────────────────────────────────
  let post: PostType | null = null;
  const rawPost = b.post;
  if (rawPost !== undefined && rawPost !== null && rawPost !== "" && rawPost !== "states") {
    if (!isPostType(rawPost)) {
      errors.push(`Unknown post type "${String(rawPost)}". Valid: ${POST_TYPES.join(", ")}`);
    } else {
      post = rawPost;
    }
  }

  // ── States. A post defines its own ordered slides, so the two never
  //    coexist — the CLI rejects the pair and so does this. Absent (with no
  //    post) means the runner's default state set, for the same reason
  //    formats default. ────────────────────────────────────────────────────
  const states: RenderState[] = [];
  const statesGiven = b.states !== undefined;
  const rawStates = statesGiven ? normalizeList(b.states) : null;
  if (statesGiven && rawStates === null) {
    errors.push("states must be an array or comma-separated list of render states");
  } else if (statesGiven && rawStates && rawStates.length && post) {
    errors.push(
      `A handoff cannot carry both a post type ("${post}") and explicit render states — ` +
        `a carousel post defines its own ordered slides`,
    );
  } else if (!post) {
    const source = statesGiven ? (rawStates ?? []) : [...DEFAULT_STATES];
    const seen = new Set<string>();
    for (const s of source) {
      if (seen.has(s)) continue;
      if (!isRenderState(s)) {
        errors.push(`Unknown state "${s}". Valid states: ${RENDER_STATES.join(", ")}`);
        continue;
      }
      seen.add(s);
      states.push(s);
    }
    if (!states.length && !errors.length) {
      errors.push("Handoff names neither a post type nor any render state");
    }
  }

  // ── Difficulty treatment ───────────────────────────────────────────────
  let difficulty: DifficultyTier | null = null;
  const rawDifficulty = b.difficulty;
  if (
    rawDifficulty !== undefined &&
    rawDifficulty !== null &&
    rawDifficulty !== "" &&
    rawDifficulty !== "per-question"
  ) {
    if (!isDifficultyTier(rawDifficulty)) {
      errors.push(
        `Unknown difficulty "${String(rawDifficulty)}". Valid tiers: ${DIFFICULTY_TIERS.join(", ")}`,
      );
    } else {
      difficulty = rawDifficulty;
    }
  }

  // ── Run name. Held to the local server's own rule, not escaped: the ────
  //    safest value is one that never needs quoting, and it names a directory.
  let runId: string | null = null;
  const rawRunId = b.runId ?? b.run;
  if (rawRunId !== undefined && rawRunId !== null && rawRunId !== "") {
    if (typeof rawRunId !== "string" || !RUN_ID_RE.test(rawRunId)) {
      errors.push(
        `Invalid run name "${String(rawRunId)}" — 1-64 letters, digits, hyphens or ` +
          `underscores (no paths)`,
      );
    } else {
      runId = rawRunId;
    }
  }

  // ── Overwrite ──────────────────────────────────────────────────────────
  const rawOverwrite = b.overwrite;
  const overwrite =
    rawOverwrite === true || rawOverwrite === "1" || rawOverwrite === "true";
  if (
    rawOverwrite !== undefined &&
    rawOverwrite !== null &&
    rawOverwrite !== "" &&
    !overwrite &&
    rawOverwrite !== false &&
    rawOverwrite !== "0" &&
    rawOverwrite !== "false"
  ) {
    errors.push(`Unreadable overwrite value "${String(rawOverwrite)}"`);
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    handoff: {
      version: CONTENT_HANDOFF_VERSION,
      questionIds,
      formats,
      post,
      states: post ? [] : states,
      difficulty,
      runId,
      overwrite,
    },
  };
}

/**
 * The ONE conversion from the Admin panel's command configuration into a
 * handoff. Admin builds a `ContentCommandConfig` for the copyable command; the
 * same object becomes the URL and the clipboard payload here, so the two
 * handoff routes can never describe different work.
 */
export function contentHandoffFromCommandConfig(
  config: ContentCommandConfig,
): ContentHandoffResult {
  return validateContentHandoff({
    version: CONTENT_HANDOFF_VERSION,
    questionIds: (config.questionIds ?? []).map((id) => String(id).trim()),
    formats: [...(config.formats ?? [])],
    post: config.post ?? null,
    states: config.post ? [] : [...(config.states ?? [])],
    difficulty: config.difficulty ?? null,
    runId: config.runId ?? null,
    overwrite: config.overwrite === true,
  });
}

/**
 * Deterministic query-string form. Fixed key order, no percent-encoding for a
 * valid handoff (every legal value is already URL-safe by its own registry's
 * grammar), and defaults omitted so the shortest correct URL is the one built.
 */
export function encodeContentHandoffParams(handoff: ContentHandoff): string {
  const enc = (list: readonly string[]) => list.map(encodeURIComponent).join(",");
  const parts: string[] = [
    `hv=${CONTENT_HANDOFF_VERSION}`,
    `ids=${enc(handoff.questionIds)}`,
  ];
  if (handoff.formats.length) parts.push(`formats=${enc(handoff.formats)}`);
  if (handoff.post) parts.push(`post=${encodeURIComponent(handoff.post)}`);
  else if (handoff.states.length) parts.push(`states=${enc(handoff.states)}`);
  if (handoff.difficulty) parts.push(`difficulty=${encodeURIComponent(handoff.difficulty)}`);
  if (handoff.runId) parts.push(`run=${encodeURIComponent(handoff.runId)}`);
  if (handoff.overwrite) parts.push("overwrite=1");
  return parts.join("&");
}

/** True when a location's query string carries a handoff at all. */
export function hasContentHandoffParams(search: string | URLSearchParams): boolean {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return params.has("ids") || params.has("hv") || params.has("questionIds");
}

/**
 * Parse a query string into a handoff, through the same validator the JSON
 * intake uses. A forbidden parameter in the URL is refused exactly as it is in
 * a pasted payload.
 */
export function decodeContentHandoffParams(
  search: string | URLSearchParams,
): ContentHandoffResult {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const raw: Record<string, unknown> = {};
  for (const [k, v] of params.entries()) raw[k] = v;
  const forbidden = forbiddenKeysIn(raw);
  if (forbidden.length) {
    return {
      ok: false,
      errors: [
        `Handoff URL carries forbidden parameter(s): ${forbidden.join(", ")}. ` +
          `Credentials, backend URLs and the diagnostic gate overrides never travel in a handoff.`,
      ],
    };
  }
  return validateContentHandoff({
    version: raw.hv ?? raw.version,
    questionIds: raw.ids ?? raw.questionIds,
    formats: raw.formats,
    post: raw.post,
    states: raw.states,
    difficulty: raw.difficulty,
    runId: raw.run ?? raw.runId,
    overwrite: raw.overwrite,
  });
}

/** Deterministic JSON form for the clipboard/import path. Fixed key order. */
export function serializeContentHandoff(handoff: ContentHandoff): string {
  return JSON.stringify(
    {
      version: handoff.version,
      questionIds: handoff.questionIds,
      formats: handoff.formats,
      post: handoff.post,
      states: handoff.states,
      difficulty: handoff.difficulty,
      runId: handoff.runId,
      overwrite: handoff.overwrite,
    },
    null,
    2,
  );
}

/**
 * Intake for a pasted payload. Accepts the JSON form, a full workspace URL, or
 * a bare query string — an operator pasting "the thing Admin gave me" should
 * not have to know which of the two it was.
 */
export function parseContentHandoffText(text: string): ContentHandoffResult {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { ok: false, errors: ["Paste a handoff payload or URL"] };
  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return {
        ok: false,
        errors: [`Not valid JSON — ${err instanceof Error ? err.message : String(err)}`],
      };
    }
    return validateContentHandoff(parsed);
  }
  const queryAt = trimmed.indexOf("?");
  const query = queryAt >= 0 ? trimmed.slice(queryAt + 1) : trimmed;
  return decodeContentHandoffParams(query);
}

/**
 * The local Studio mode a handoff seeds. `null` post means explicit render
 * states, which the Studio server calls `classic`; the two post types are
 * spelled identically in both registries (asserted in the suite).
 */
export function studioModeForHandoff(handoff: ContentHandoff): StudioModeKey {
  return (handoff.post ?? "classic") as StudioModeKey;
}

/**
 * The Studio job body a handoff seeds, in the shape `validateStudioJob` takes.
 * The workspace does not generate from this directly — the operator's local
 * edits are the final configuration — but it is what proves a handoff is a
 * legal seed for the local server, not merely a legal URL.
 */
export function studioJobBodyFromHandoff(handoff: ContentHandoff): Record<string, unknown> {
  const mode = studioModeForHandoff(handoff);
  const body: Record<string, unknown> = {
    mode,
    questionIds: [...handoff.questionIds],
    formats: [...handoff.formats],
    overwrite: handoff.overwrite,
  };
  if (mode === "classic") body.states = [...handoff.states];
  if (handoff.difficulty) body.difficulty = handoff.difficulty;
  if (handoff.runId) body.runId = handoff.runId;
  return body;
}
