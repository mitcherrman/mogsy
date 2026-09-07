/**
 * CON1 Step 3B — review keys as first-class Content Factory identities.
 * PURE: no React, no DOM, no fetch, no fs.
 *
 * A row in Admin's source universe may be any of six things, and only some of
 * them are content:
 *
 *   stored question          a persisted row, addressed by its numeric id
 *   deterministic generated  a materialized instance a code enumerator
 *   instance                 declares (Mastery)
 *   persisted candidate      a generated row awaiting review (Ranked)
 *   definition only          a generator, not a question (family, Meta rule)
 *   frozen snapshot          a copy taken at serve time
 *   runtime specimen         a card built for one seed, never persisted
 *
 * A `review_key` is the durable identity of one such row. This module owns the
 * client-side half of that identity: the grammar it must satisfy to travel
 * through a URL, a clipboard payload and a shell argument, and the mirror of
 * the backend's publishability policy so Admin can grey out a control without
 * a round trip.
 *
 * THE BACKEND IS THE AUTHORITY, NOT THIS FILE.
 * `quiz/review_render.py::SOURCE_POLICY` decides what may be published, and
 * the resolver returns its refusal code with every refusal. What lives here is
 * the same vocabulary, so a disabled button can say WHY before the operator
 * clicks — an EARLY gate, never the only one. The two repos cannot import each
 * other, so the guarantee is structural rather than a shared constant: this
 * file can only ever be more conservative in the UI, and every path that
 * actually renders anything goes through the backend resolver, which refuses
 * on its own (`test_quiz_review_render_keys.py`).
 */

/**
 * The TRANSPORT boundary for a review key — deliberately not a character
 * allow-list.
 *
 * Measured against the live bank, stored `question_key` values contain spaces,
 * apostrophes, `|`, `/`, `+`, `&` and non-ASCII letters (`Bel'Veth`,
 * `Dr. Mundo`). An allow-list would reject most of the corpus. What a key
 * genuinely cannot contain is what breaks the channels it travels through:
 *
 *   `,`                the `--review-keys` list separator
 *   control chars      a shell and a header boundary
 *   a leading `-`      a value that could be read as a flag
 *
 * Length is capped at 200; the longest stored key measured is 166.
 * This is character-for-character the backend's `REVIEW_KEY_RE`.
 */
import { isFailure } from "../result-narrowing";

export const REVIEW_KEY_MAX_LENGTH = 200;
// eslint-disable-next-line no-control-regex
export const REVIEW_KEY_RE = /^[^\u0000-\u001f\u007f,-][^\u0000-\u001f\u007f,]{0,199}$/;

/** `<prefix>` → the `source_kind` the review universe emits for it. */
export const GENERATED_NAMESPACES: Readonly<Record<string, string>> = {
  "mastery:": "mastery_question",
  /**
   * CON1 Step 3C — one namespace for every frozen Daily card, quiz and Meta
   * Reflex alike. A second namespace would give one card two names, which
   * Step 3B's Part 4 forbids; the reflex cards are refused PER CARD by the
   * backend, and the discovery row carries that refusal on itself
   * (`render_refusal`) so the button is greyed out before the click.
   */
  "daily:": "daily_card",
  "ranked:": "ranked_candidate",
  "ranked-fallback:": "ranked_fallback",
  "family:": "family_definition",
  "meta-rule:": "meta_reflex_rule",
  "meta-specimen:": "meta_reflex_specimen",
};

export const STORED_SOURCE_KIND = "stored_question";

/** Source kinds the Content Factory can publish through a review key. */
export const PUBLISHABLE_REVIEW_SOURCE_KINDS: readonly string[] = [
  "mastery_question",
  /**
   * Publishable at the NAMESPACE level only. Daily is the first source whose
   * publishability is a property of the CARD rather than of the kind: one
   * frozen day holds ~13 cards and five of them are two-entity Meta Reflex
   * cards. `sourceKindSupport` therefore takes the ROW's own `render_refusal`
   * when it has one — see `reviewRowSupport` below — and the backend refuses
   * independently either way.
   */
  "daily_card",
] as const;

/** Refusal codes, shared verbatim with `quiz/review_render.py`. */
export const REFUSAL_CODES = {
  definitionOnly: "definition_only",
  incompleteMaterialization: "incomplete_materialization",
  rendererUnsupported: "renderer_unsupported",
  notIntegrated: "not_integrated",
  useQuestionId: "use_question_id",
} as const;

/**
 * Operator-facing reasons, one per refusing source kind.
 *
 * Short on purpose: this is a tooltip beside a disabled button, not the
 * handoff document. The backend's own longer reason travels with a real
 * resolution attempt.
 */
export const SOURCE_REFUSALS: Readonly<
  Record<string, { code: string; reason: string }>
> = {
  [STORED_SOURCE_KIND]: {
    code: REFUSAL_CODES.useQuestionId,
    reason:
      "A stored question is handed off by its id, not its key — select it in the Questions tab.",
  },
  family_definition: {
    code: REFUSAL_CODES.definitionOnly,
    reason: "Definition only — a family describes a generator, not a question.",
  },
  meta_reflex_rule: {
    code: REFUSAL_CODES.definitionOnly,
    reason: "Definition only — a Meta Reflex rule declares a pool, not a card.",
  },
  meta_reflex_specimen: {
    code: REFUSAL_CODES.rendererUnsupported,
    reason:
      "Renderer unsupported — a swipe specimen is a two-entity card, and it is not persisted.",
  },
  ranked_candidate: {
    code: REFUSAL_CODES.incompleteMaterialization,
    reason:
      "Incomplete materialization — Ranked candidates carry no explanation, and none are accepted yet.",
  },
  ranked_fallback: {
    code: REFUSAL_CODES.incompleteMaterialization,
    reason:
      "Incomplete materialization — every staff-fallback row's explanation is null.",
  },
};

export type ReviewKeyParse =
  | { ok: true; sourceKind: string; remainder: string; key: string }
  | { ok: false; error: string };

/**
 * `(sourceKind, remainder)` for a syntactically valid review key.
 *
 * Longest prefix wins, so `ranked-fallback:` is never mis-read as `ranked:`.
 * A key matching no prefix is a stored `question_key` — that is what the
 * universe emits as the review key for a stored row.
 */
export function parseReviewKey(raw: unknown): ReviewKeyParse {
  if (typeof raw !== "string") return { ok: false, error: "A review key must be a string" };
  const key = raw.trim();
  if (!key) return { ok: false, error: "A review key must not be empty" };
  if (key.length > REVIEW_KEY_MAX_LENGTH) {
    return {
      ok: false,
      error: `Review key is ${key.length} characters; the maximum is ${REVIEW_KEY_MAX_LENGTH}`,
    };
  }
  if (!REVIEW_KEY_RE.test(key)) {
    return {
      ok: false,
      error:
        `Review key "${key}" contains a character it cannot travel with ` +
        `(a comma, a control character, or a leading "-")`,
    };
  }
  const prefixes = Object.keys(GENERATED_NAMESPACES).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (key.startsWith(prefix)) {
      const remainder = key.slice(prefix.length);
      if (!remainder) {
        return {
          ok: false,
          error: `Review key "${key}" names a namespace but no id inside it`,
        };
      }
      return { ok: true, sourceKind: GENERATED_NAMESPACES[prefix], remainder, key };
    }
  }
  return { ok: true, sourceKind: STORED_SOURCE_KIND, remainder: key, key };
}

/**
 * A support verdict, discriminated by `ok` rather than by a prettier
 * `supported`, so the repo's ONE narrowing helper (`isFailure`) covers it. The
 * app compiles with `strictNullChecks` off, where a boolean discriminant does
 * not narrow on its own — see `src/lib/result-narrowing.ts`.
 */
export type ReviewKeySupport =
  | { ok: true; sourceKind: string; key: string }
  | { ok: false; sourceKind: string | null; code: string; reason: string };

/**
 * Whether one review key may be handed to the Content Factory, and why not.
 *
 * Used to enable/disable Generate Content on a universe row WITHOUT a fetch.
 * The backend resolver still refuses independently — this never becomes the
 * only gate, only the earliest one.
 */
export function reviewKeySupport(raw: unknown): ReviewKeySupport {
  const parsed = parseReviewKey(raw);
  if (isFailure(parsed)) {
    return { ok: false, sourceKind: null, code: "invalid_key", reason: parsed.error };
  }
  return sourceKindSupport(parsed.sourceKind, parsed.key);
}

/** The same verdict from a universe row's declared `source_kind`. */
export function sourceKindSupport(sourceKind: string, key = ""): ReviewKeySupport {
  if (PUBLISHABLE_REVIEW_SOURCE_KINDS.includes(sourceKind)) {
    return { ok: true, sourceKind, key };
  }
  const refusal = SOURCE_REFUSALS[sourceKind];
  if (refusal) return { ok: false, sourceKind, ...refusal };
  return {
    ok: false,
    sourceKind,
    code: REFUSAL_CODES.notIntegrated,
    reason: `Source kind "${sourceKind}" is not integrated with the Content Factory yet.`,
  };
}

/**
 * A discovery row's OWN publishability verdict, when it carries one.
 *
 * Every other source's verdict is decided by its `source_kind`, and that is
 * still the default. Daily cannot be decided that way — a single frozen day
 * holds both publishable quiz cards and unpublishable Meta Reflex cards under
 * one namespace — so the backend collector computes the verdict per card
 * (`quiz.daily_review.card_refusal`, the SAME function the resolver refuses
 * with) and attaches it to the row.
 *
 * Reading the row's refusal first is what keeps the two in step. It is not a
 * Daily branch: any source may attach one, and a row without one falls through
 * to the shared source-kind policy exactly as before.
 */
export function reviewRowSupport(row: {
  source_kind: string;
  review_key: string;
  render_refusal?: { code: string; reason: string } | null;
}): ReviewKeySupport {
  const refusal = row.render_refusal;
  if (refusal && typeof refusal.code === "string" && refusal.code) {
    return {
      ok: false,
      sourceKind: row.source_kind,
      code: refusal.code,
      reason: refusal.reason || refusal.code,
    };
  }
  return sourceKindSupport(row.source_kind, row.review_key);
}

/**
 * Validate and dedupe an ordered list of review keys.
 *
 * Order is the artefact's order and is never sorted. A repeat is dropped
 * rather than reported: a selection is a set.
 */
export function normalizeReviewKeys(
  raw: ReadonlyArray<unknown>,
  errors: string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const support = reviewKeySupport(value);
    if (isFailure(support)) {
      errors.push(support.reason);
      continue;
    }
    if (seen.has(support.key)) continue;
    seen.add(support.key);
    out.push(support.key);
  }
  return out;
}
