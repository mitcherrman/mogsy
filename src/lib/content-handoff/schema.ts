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
import { reviewKeySupport } from "../quiz-screenshot/reviewSource";
import { isFailure } from "../result-narrowing";
import type { ContentCommandConfig } from "../quiz-screenshot/command";

/**
 * Wire versions.
 *
 * v1 — `questionIds`, stored ids only. Every v1 payload ever emitted still
 *      parses, and a stored-only selection still SERIALIZES as v1, so the URLs
 *      and clipboard payloads Step 3A proved are byte-identical today.
 * v2 — CON1 Step 3B. `items`: an ORDERED list of typed sources, so a review
 *      key is a first-class identity rather than a string smuggled through an
 *      id field. Emitted only when the selection actually contains one.
 *
 * Two wire shapes rather than a migration, because a handoff is ephemeral —
 * it is a link an operator follows now — and paying for a rewrite of the v1
 * proof would buy nothing.
 */
export const CONTENT_HANDOFF_VERSION = 1;
export const CONTENT_HANDOFF_VERSION_V2 = 2;
export const SUPPORTED_HANDOFF_VERSIONS: readonly number[] = [1, 2] as const;

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
/**
 * One selected source, typed.
 *
 * The kind is carried EXPLICITLY rather than sniffed from the value's shape.
 * A stored id and a review key resolve through different backend routes, and
 * a numeric-looking review key or an id-shaped key would otherwise silently
 * take the wrong one.
 */
export type ContentHandoffItem =
  | { kind: "question-id"; value: string }
  | { kind: "review-key"; value: string };

export const HANDOFF_ITEM_KINDS = ["question-id", "review-key"] as const;

/** Query-string tag per kind. `items=qid:41,rk:mastery%3Assm.base.FLASH`. */
export const HANDOFF_ITEM_TAGS: Record<ContentHandoffItem["kind"], string> = {
  "question-id": "qid",
  "review-key": "rk",
};

export type ContentHandoff = {
  version: number;
  /**
   * The canonical ORDERED selection. Everything below is derived from it.
   *
   * The model can represent a mixed list; the validator refuses one today,
   * because the runner's source flags are mutually exclusive and a handoff
   * that could not be run would be worse than one that is refused early. When
   * the runner grows a mixed source mode, this field is already the right
   * shape and only the refusal moves.
   */
  items: ContentHandoffItem[];
  /** Ordered, deduped question ids. Order is the artefact's order. */
  questionIds: string[];
  /** Ordered, deduped review keys (CON1 Step 3B). */
  reviewKeys: string[];
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
 * Read the v2 `items` field from either wire form.
 *
 * Object form  `[{kind:"review-key", value:"mastery:…"}, …]`
 * String form  `"qid:41,rk:mastery%3Assm.base.FLASH"` — the URL's, where the
 *              tag is separated by the FIRST colon and the value is
 *              percent-decoded. A review key's own colons therefore cannot be
 *              mistaken for the separator.
 */
export function parseHandoffItems(raw: unknown, errors: string[]): ContentHandoffItem[] {
  const out: ContentHandoffItem[] = [];
  const push = (kindRaw: unknown, valueRaw: unknown, where: string) => {
    const kind = String(kindRaw ?? "").trim();
    const value = String(valueRaw ?? "").trim();
    if (kind !== "question-id" && kind !== "review-key") {
      errors.push(
        `Unknown handoff item kind "${kind}" in ${where}. Valid kinds: ` +
          HANDOFF_ITEM_KINDS.join(", "),
      );
      return;
    }
    if (!value) {
      errors.push(`Handoff item in ${where} has no value`);
      return;
    }
    out.push({ kind, value } as ContentHandoffItem);
  };

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const rec = asRecord(entry);
      if (!rec) {
        errors.push(`Handoff item must be an object with kind and value`);
        continue;
      }
      push(rec.kind, rec.value, "items");
    }
    return out;
  }
  if (typeof raw === "string") {
    for (const token of raw.split(",").map((t) => t.trim()).filter(Boolean)) {
      const at = token.indexOf(":");
      if (at <= 0) {
        errors.push(`Handoff item "${token}" is missing its kind tag (qid: or rk:)`);
        continue;
      }
      const tag = token.slice(0, at);
      let value: string;
      try {
        value = decodeURIComponent(token.slice(at + 1));
      } catch {
        errors.push(`Handoff item "${token}" is not decodable`);
        continue;
      }
      const kind = (Object.keys(HANDOFF_ITEM_TAGS) as ContentHandoffItem["kind"][]).find(
        (k) => HANDOFF_ITEM_TAGS[k] === tag,
      );
      if (!kind) {
        errors.push(
          `Unknown handoff item tag "${tag}". Valid tags: ` +
            Object.values(HANDOFF_ITEM_TAGS).join(", "),
        );
        continue;
      }
      push(kind, value, "items");
    }
    return out;
  }
  errors.push("items must be an array of {kind, value} or a tagged comma list");
  return out;
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
  let declaredVersion: number | null = null;
  const rawVersion = b.version ?? b.v;
  if (rawVersion !== undefined && rawVersion !== null && rawVersion !== "") {
    const n = typeof rawVersion === "string" ? Number(rawVersion) : rawVersion;
    if (typeof n !== "number" || !Number.isInteger(n)) {
      errors.push(`Unreadable handoff version "${String(rawVersion)}"`);
    } else if (!SUPPORTED_HANDOFF_VERSIONS.includes(n)) {
      errors.push(
        `Handoff version ${n} is not supported (this workspace speaks v` +
          `${SUPPORTED_HANDOFF_VERSIONS.join(" and v")})`,
      );
    } else {
      declaredVersion = n;
    }
  }

  // ── Selection — v2 `items`, or v1 `questionIds`/`ids`. Never both: two
  //    orderings of the same selection is exactly the source ambiguity a
  //    typed handoff exists to remove. ──────────────────────────────────────
  const itemsGiven = b.items !== undefined && b.items !== null && b.items !== "";
  const idsGiven =
    (b.questionIds !== undefined && b.questionIds !== null && b.questionIds !== "") ||
    (b.ids !== undefined && b.ids !== null && b.ids !== "");
  const items: ContentHandoffItem[] = [];
  const questionIds: string[] = [];
  const reviewKeys: string[] = [];

  if (itemsGiven && idsGiven) {
    errors.push(
      "Handoff carries both `items` (v2) and `questionIds` (v1) — one selection, one list",
    );
  } else if (itemsGiven) {
    const parsed = parseHandoffItems(b.items, errors);
    items.push(...parsed);
  } else {
    const rawIds = normalizeList(b.questionIds ?? b.ids);
    if (rawIds === null) {
      errors.push("questionIds must be an array of ids or a comma-separated list");
    } else {
      for (const id of rawIds) items.push({ kind: "question-id", value: id });
    }
  }

  // Validate + dedupe, preserving order. A repeat is dropped, not reported:
  // a selection is a set.
  {
    const seen = new Set<string>();
    const kept: ContentHandoffItem[] = [];
    for (const item of items) {
      const token = `${item.kind}:${item.value}`;
      if (seen.has(token)) continue;
      if (item.kind === "question-id") {
        if (!QUESTION_ID_RE.test(item.value)) {
          errors.push(`Invalid question id "${item.value}"`);
          continue;
        }
        seen.add(token);
        kept.push(item);
        questionIds.push(item.value);
      } else {
        const support = reviewKeySupport(item.value);
        if (isFailure(support)) {
          errors.push(`Review key "${item.value}": ${support.reason}`);
          continue;
        }
        seen.add(token);
        kept.push(item);
        reviewKeys.push(item.value);
      }
    }
    items.length = 0;
    items.push(...kept);
  }

  if (questionIds.length && reviewKeys.length) {
    errors.push(
      "A handoff names one source kind. This one mixes " +
        `${questionIds.length} stored question id(s) with ${reviewKeys.length} review key(s), ` +
        "and the runner's source flags are mutually exclusive.",
    );
  }
  if (!items.length && !errors.length) errors.push("Handoff selects no questions");
  if (items.length > MAX_BATCH_LIMIT) {
    errors.push(
      `Handoff selects ${items.length} questions — the runner's maximum is ${MAX_BATCH_LIMIT}`,
    );
  }

  // A payload that CALLS itself v1 while carrying a review key is refused
  // rather than upgraded: a consumer that only speaks v1 would read the
  // version, trust it, and then not understand the selection.
  const impliedVersion = reviewKeys.length
    ? CONTENT_HANDOFF_VERSION_V2
    : CONTENT_HANDOFF_VERSION;
  if (declaredVersion !== null && declaredVersion < impliedVersion) {
    errors.push(
      `Handoff declares v${declaredVersion} but carries a review key, which is v` +
        `${CONTENT_HANDOFF_VERSION_V2}`,
    );
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
      version: impliedVersion,
      items,
      questionIds,
      reviewKeys,
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
  const reviewKeys = (config.reviewKeys ?? []).map((k) => String(k).trim()).filter(Boolean);
  const questionIds = (config.questionIds ?? []).map((id) => String(id).trim()).filter(Boolean);
  const items: ContentHandoffItem[] = [
    ...questionIds.map((value) => ({ kind: "question-id" as const, value })),
    ...reviewKeys.map((value) => ({ kind: "review-key" as const, value })),
  ];
  return validateContentHandoff({
    version: reviewKeys.length ? CONTENT_HANDOFF_VERSION_V2 : CONTENT_HANDOFF_VERSION,
    items,
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
  // A stored-only selection still serializes as v1 `ids=…`, byte for byte what
  // Step 3A emitted. v2 appears only when the selection actually needs it.
  const parts: string[] =
    handoff.version === CONTENT_HANDOFF_VERSION_V2
      ? [
          `hv=${CONTENT_HANDOFF_VERSION_V2}`,
          `items=${handoff.items
            .map((i) => `${HANDOFF_ITEM_TAGS[i.kind]}:${encodeURIComponent(i.value)}`)
            .join(",")}`,
        ]
      : [`hv=${CONTENT_HANDOFF_VERSION}`, `ids=${enc(handoff.questionIds)}`];
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
  return (
    params.has("ids") ||
    params.has("hv") ||
    params.has("questionIds") ||
    params.has("items")
  );
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
    items: raw.items,
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
  const selection =
    handoff.version === CONTENT_HANDOFF_VERSION_V2
      ? { items: handoff.items }
      : { questionIds: handoff.questionIds };
  return JSON.stringify(
    {
      version: handoff.version,
      ...selection,
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
  // CON1 Step 3B — a review-key selection travels in its own field, for the
  // same reason it has its own CLI flag: `validateStudioJob` resolves the two
  // through different backend routes and must not have to guess which it got.
  if (handoff.reviewKeys.length) body.reviewKeys = [...handoff.reviewKeys];
  if (mode === "classic") body.states = [...handoff.states];
  if (handoff.difficulty) body.difficulty = handoff.difficulty;
  if (handoff.runId) body.runId = handoff.runId;
  return body;
}
