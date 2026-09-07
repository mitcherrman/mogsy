/**
 * CON1 Step 3B — the review-key identity contract.
 *
 * The grammar cases below are drawn from the LIVE bank rather than invented:
 * measured over 58,628 stored `question_key` values, they contain spaces
 * (191,967 occurrences), apostrophes (692), `|` (101,230), `+` (710), `/` (9),
 * commas (8) and non-ASCII letters. A character allow-list would have rejected
 * most of the corpus, so the grammar is a transport boundary and these tests
 * are what hold it to that.
 */
import { describe, expect, it } from "vitest";
import { isFailure } from "../result-narrowing";
import {
  GENERATED_NAMESPACES,
  PUBLISHABLE_REVIEW_SOURCE_KINDS,
  REFUSAL_CODES,
  REVIEW_KEY_MAX_LENGTH,
  SOURCE_REFUSALS,
  STORED_SOURCE_KIND,
  normalizeReviewKeys,
  parseReviewKey,
  reviewKeySupport,
  sourceKindSupport,
} from "./reviewSource";

const MASTERY_KEY = "mastery:ssm.base.BARRIER";
/** A real declared concept id — the `+` is why `encodeURIComponent` matters. */
const MASTERY_COMBINED = "mastery:ssm.combined.BARRIER.cosmic-insight+ionian-boots-of-lucidity";

describe("review-key grammar", () => {
  it("dispatches every generated namespace to its source kind", () => {
    for (const [prefix, kind] of Object.entries(GENERATED_NAMESPACES)) {
      const parsed = parseReviewKey(`${prefix}x`);
      expect(isFailure(parsed)).toBe(false);
      if (!isFailure(parsed)) expect(parsed.sourceKind).toBe(kind);
    }
  });

  it("never mis-reads ranked-fallback: as ranked: — longest prefix wins", () => {
    const fallback = parseReviewKey("ranked-fallback:staffq-1");
    const candidate = parseReviewKey("ranked:flat_inventory_stat_total:17:x");
    expect(isFailure(fallback) ? null : fallback.sourceKind).toBe("ranked_fallback");
    expect(isFailure(candidate) ? null : candidate.sourceKind).toBe("ranked_candidate");
  });

  it("treats an unprefixed key as a stored question key", () => {
    const parsed = parseReviewKey("ability_cooldown_haste:champ-aatrox-q-r3-h20");
    expect(isFailure(parsed) ? null : parsed.sourceKind).toBe(STORED_SOURCE_KIND);
  });

  it("accepts the awkward characters real stored keys actually contain", () => {
    for (const key of [
      "ability_cooldown_compare:Bel'Veth:R:vs:Blitzcrank:R:r1",
      "ability_cooldown_compare:Diana:R:vs:Dr. Mundo:R:r1",
      "item_recipe|Sunfire Aegis",
      "champion_stat:Kai'Sa:ç/é",
      "fundamental_armor_physical_damage", // one of the 6 keys with no colon
      MASTERY_COMBINED,
    ]) {
      expect(isFailure(parseReviewKey(key)), key).toBe(false);
    }
  });

  it("refuses a comma — the --review-keys list separator", () => {
    const parsed = parseReviewKey("mastery:a,b");
    expect(isFailure(parsed)).toBe(true);
    if (isFailure(parsed)) expect(parsed.error).toMatch(/comma/i);
  });

  it("refuses a value that could be read as a flag", () => {
    expect(isFailure(parseReviewKey("--allow-missing-assets"))).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["newline", "mastery:a\nb"],
    ["control char", "mastery:a\u0001b"],
    ["namespace with no id", "mastery:"],
    ["not a string", 41],
    ["too long", `mastery:${"x".repeat(REVIEW_KEY_MAX_LENGTH)}`],
  ])("refuses %s", (_label, value) => {
    expect(isFailure(parseReviewKey(value))).toBe(true);
  });

  it("trims before judging, so a pasted key with whitespace still works", () => {
    const parsed = parseReviewKey(`  ${MASTERY_KEY}  `);
    expect(isFailure(parsed) ? null : parsed.key).toBe(MASTERY_KEY);
  });
});

describe("publishability policy", () => {
  it("supports exactly the sources that were integrated, in order", () => {
    // An EXACT list, so adding a source stays a conscious act on both sides of
    // the wire. Step 3B: Mastery. Step 3C: the frozen Daily card — publishable
    // at the NAMESPACE level only, with the per-card verdict riding on the row
    // (see `reviewRowSupport`).
    expect([...PUBLISHABLE_REVIEW_SOURCE_KINDS]).toEqual([
      "mastery_question",
      "daily_card",
    ]);
    expect(isFailure(reviewKeySupport(MASTERY_KEY))).toBe(false);
  });

  it("refuses a family definition — a definition must never look publishable", () => {
    const support = reviewKeySupport("family:ability_cooldown_haste");
    expect(isFailure(support)).toBe(true);
    if (isFailure(support)) expect(support.code).toBe(REFUSAL_CODES.definitionOnly);
  });

  it("refuses a Meta Reflex rule as a definition, and its specimen as unrendered", () => {
    const rule = reviewKeySupport("meta-rule:attack_type:melee");
    const specimen = reviewKeySupport("meta-specimen:attack_type:melee:0");
    expect(isFailure(rule) ? rule.code : null).toBe(REFUSAL_CODES.definitionOnly);
    expect(isFailure(specimen) ? specimen.code : null).toBe(
      REFUSAL_CODES.rendererUnsupported,
    );
  });

  it("refuses a stored key, naming the id route instead", () => {
    const support = reviewKeySupport("item_cost:Long Sword");
    expect(isFailure(support) ? support.code : null).toBe(REFUSAL_CODES.useQuestionId);
  });

  it("refuses an unknown source kind rather than defaulting it in", () => {
    const support = sourceKindSupport("daily_frozen_card");
    expect(isFailure(support) ? support.code : null).toBe(REFUSAL_CODES.notIntegrated);
    if (isFailure(support)) expect(support.reason).toContain("daily_frozen_card");
  });

  it("gives every declared namespace a verdict — no silent gaps", () => {
    for (const kind of Object.values(GENERATED_NAMESPACES)) {
      const supported = PUBLISHABLE_REVIEW_SOURCE_KINDS.includes(kind);
      expect(supported || kind in SOURCE_REFUSALS, kind).toBe(true);
    }
  });

  it("uses only declared refusal codes", () => {
    const codes = new Set(Object.values(REFUSAL_CODES));
    for (const refusal of Object.values(SOURCE_REFUSALS)) {
      expect(codes.has(refusal.code as never)).toBe(true);
      expect(refusal.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeReviewKeys", () => {
  it("preserves selection order and never sorts", () => {
    const errors: string[] = [];
    const keys = normalizeReviewKeys(
      [MASTERY_COMBINED, MASTERY_KEY, "mastery:ssm.base.CLEANSE"],
      errors,
    );
    expect(errors).toEqual([]);
    expect(keys).toEqual([MASTERY_COMBINED, MASTERY_KEY, "mastery:ssm.base.CLEANSE"]);
  });

  it("drops a repeat without reporting it — a selection is a set", () => {
    const errors: string[] = [];
    expect(normalizeReviewKeys([MASTERY_KEY, MASTERY_KEY], errors)).toEqual([MASTERY_KEY]);
    expect(errors).toEqual([]);
  });

  it("reports each unusable key with its own reason", () => {
    const errors: string[] = [];
    const keys = normalizeReviewKeys([MASTERY_KEY, "family:x", "mastery:a,b"], errors);
    expect(keys).toEqual([MASTERY_KEY]);
    expect(errors).toHaveLength(2);
  });
});
