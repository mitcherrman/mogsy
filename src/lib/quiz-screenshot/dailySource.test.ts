/**
 * CON1 Step 3C — the frozen Daily card as a Content Factory source. PURE.
 *
 * Every payload below is the backend resolver's REAL answer, dumped from a
 * composed fixture Daily (`test_con1_daily_frozen_cards.py`'s `with_media`
 * fixture) rather than hand-written, so a shape drift between the two repos
 * fails here instead of at capture time.
 *
 * What is being held:
 *   1. the Daily namespace parses, dispatches and does not collide;
 *   2. a per-CARD refusal on the row beats the per-KIND policy, and only where
 *      a row carries one;
 *   3. the frozen `media` blob really does reach the picture — this is the
 *      first generated source for which that is true at all;
 *   4. the readiness verdict comes from the shared evaluator with no Daily
 *      branch;
 *   5. the key survives the CLI, the handoff and the manifest, framing intact.
 */
import { describe, expect, it } from "vitest";
import {
  GENERATED_NAMESPACES,
  PUBLISHABLE_REVIEW_SOURCE_KINDS,
  normalizeReviewKeys,
  parseReviewKey,
  reviewKeySupport,
  reviewRowSupport,
} from "./reviewSource";
import { adaptScreenshotQuestion } from "./adapt";
import { resolveScenarioPresentation } from "./presentation";
import { evaluateContentReadiness } from "./readiness";
import { manifestSourceEntry } from "./manifest";
import { buildContentCommand, type ContentCommandConfig } from "./command";
import { DEFAULT_FORMAT_KEYS, DEFAULT_STATES, parseScreenshotCli } from "./cli";
import {
  contentHandoffFromCommandConfig,
  decodeContentHandoffParams,
  encodeContentHandoffParams,
} from "@/lib/content-handoff/schema";
import { isFailure } from "@/lib/result-narrowing";

const KEY = "daily:2026-08-20:v1:12";
const REFLEX_KEY = "daily:2026-08-20:v1:4";

/** The resolver's real answer for one frozen card, verbatim. */
const DAILY_ITEM = {
  review_key: KEY,
  source_kind: "daily_card",
  materialization: "frozen_snapshot",
  id: KEY,
  question_key: "item_cost:fixture-1-86",
  question_text: "Fixture question for item_cost:fixture-1-86?",
  format: "multiple_choice",
  category: "item_cost category",
  difficulty: 1,
  choices: [
    { label: "item_cost opt 86.0" },
    { label: "item_cost opt 86.1" },
    { label: "item_cost opt 86.2" },
    { label: "item_cost opt 86.3" },
  ],
  correct_answer: "item_cost opt 86.2",
  correct_index: 2,
  explanation: "Because item_cost:fixture-1-86 says so.",
  image_path: null,
  metadata: { cost: 350, item_name: "Long Sword" },
  asset_status: {
    status: "resolved",
    reason: "",
    references: [
      {
        channel: "assets.subject.icon",
        path: "assets/items/1036.png",
        requirement: "required",
        resolution: "match",
        resolved_path: "assets/items/1036.png",
        reason: "",
      },
    ],
    unresolved: [],
    degraded_to_text: false,
    optional_unresolved: false,
    case_repaired: false,
  },
  provenance: {
    review_key: KEY,
    source_kind: "daily_card",
    materialization: "frozen_snapshot",
    family: "item_cost",
    source_version: "58173623e3094b7b84d08d0afdbefe4fc76d96edb16f44779ebe8ba395c8a746",
    specimen_version: null,
    data_version: null,
    source_question_key: "item_cost:fixture-1-86",
    source_question_id: 87,
    framing: {
      kind: "daily",
      challenge_date: "2026-08-20",
      challenge_version: 1,
      sequence: 12,
      card_index: 1,
      slot_index: 8,
      card_kind: "quiz",
      tier: "easy",
      wave: "close",
      pool_id: "easy_item_cost",
      points: 100,
      card_count: 12,
      theme: null,
      rules_version: 1,
      plan_version: 1,
      content_fingerprint:
        "58173623e3094b7b84d08d0afdbefe4fc76d96edb16f44779ebe8ba395c8a746",
      frozen: true,
    },
  },
  /** The FROZEN media blob — the Ranked media shape, not a premise dict. */
  presentation: {
    assets: {
      subject: { icon: "assets/items/1036.png", id: 1036, name: "Long Sword", type: "item" },
    },
    presentation: { role: "context", spoiler: false, timing: "question" },
  },
} as const;

const row = (over: Record<string, unknown>) => ({
  review_key: KEY,
  source_kind: "daily_card",
  render_refusal: null,
  ...over,
}) as never;

describe("the Daily namespace", () => {
  it("dispatches every card key to daily_card", () => {
    expect(GENERATED_NAMESPACES["daily:"]).toBe("daily_card");
    const parsed = parseReviewKey(KEY);
    expect(isFailure(parsed)).toBe(false);
    if (!isFailure(parsed)) {
      expect(parsed.sourceKind).toBe("daily_card");
      expect(parsed.remainder).toBe("2026-08-20:v1:12");
    }
  });

  it("is publishable at the namespace level", () => {
    expect(PUBLISHABLE_REVIEW_SOURCE_KINDS).toContain("daily_card");
    expect(isFailure(reviewKeySupport(KEY))).toBe(false);
  });

  it("survives the transport rules a key must satisfy", () => {
    // No comma, no control character, no leading `-`, and short enough — the
    // three things a review key genuinely cannot carry through the CLI, the
    // URL and the clipboard.
    expect(KEY).not.toContain(",");
    expect(KEY.startsWith("-")).toBe(false);
    expect(KEY.length).toBeLessThan(200);
    expect(encodeURIComponent(KEY)).not.toContain("+");
  });

  it("keeps different versions and positions apart", () => {
    const keys = [
      "daily:2026-08-20:v1:3",
      "daily:2026-08-20:v2:3",
      "daily:2026-08-20:v1:4",
      "daily:2026-08-21:v1:3",
    ];
    expect(new Set(normalizeReviewKeys(keys, [])).size).toBe(4);
  });
});

describe("publishability is per CARD for Daily", () => {
  it("takes the row's own refusal when it carries one", () => {
    const support = reviewRowSupport(
      row({
        review_key: REFLEX_KEY,
        render_refusal: {
          code: "renderer_unsupported",
          reason: "A frozen Meta Reflex card is a two-entity swipe card.",
        },
      }),
    );
    expect(isFailure(support)).toBe(true);
    if (isFailure(support)) {
      expect(support.code).toBe("renderer_unsupported");
      expect(support.reason).toMatch(/Meta Reflex/);
    }
  });

  it("falls through to the source-kind policy when the row carries none", () => {
    expect(isFailure(reviewRowSupport(row({})))).toBe(false);
    const definition = reviewRowSupport(
      row({ review_key: "family:item_cost", source_kind: "family_definition" }),
    );
    expect(isFailure(definition)).toBe(true);
    if (isFailure(definition)) expect(definition.code).toBe("definition_only");
  });

  it("is not a Daily branch — any source may attach one", () => {
    const support = reviewRowSupport(
      row({
        review_key: "mastery:ssm.base.BARRIER",
        source_kind: "mastery_question",
        render_refusal: { code: "incomplete_materialization", reason: "measured" },
      }),
    );
    expect(isFailure(support)).toBe(true);
    if (isFailure(support)) expect(support.code).toBe("incomplete_materialization");
  });
});

describe("the frozen media reaches the picture", () => {
  const adapted = adaptScreenshotQuestion(DAILY_ITEM as never);

  it("adapts with no per-source branch", () => {
    expect(typeof adapted).not.toBe("string");
    if (typeof adapted === "string") return;
    expect(adapted.correct_index).toBe(2);
    expect(adapted.choices.map((c) => c.label)).toEqual(
      DAILY_ITEM.choices.map((c) => c.label),
    );
    expect(adapted.review_key).toBe(KEY);
    expect(adapted.source_kind).toBe("daily_card");
  });

  it("carries the frozen blob through verbatim, substituting nothing", () => {
    if (typeof adapted === "string") throw new Error(adapted);
    expect(adapted.presentation).toEqual(DAILY_ITEM.presentation);
    expect(adapted.presentation).not.toEqual(DAILY_ITEM.metadata);
  });

  it("resolves to a CINEMATIC band, not to text", () => {
    // The measurement that made Step 3C worth doing: Mastery's presentation is
    // absent, so it passed the Step 1D gate without ever exercising it. A
    // frozen Daily card is the first generated source that actually draws.
    if (typeof adapted === "string") throw new Error(adapted);
    const resolved = resolveScenarioPresentation(adapted);
    expect(resolved.status).toBe("cinematic");
    expect(resolved.band).toBe("cinematic");
  });

  it("is READY through the shared evaluator", () => {
    const readiness = evaluateContentReadiness(DAILY_ITEM as never);
    expect(readiness.state).toBe("ready");
    expect(readiness.blocking).toBe(false);
    expect(readiness.presentation).toBe("cinematic");
    expect(readiness.assetStatus).toBe("resolved");
  });

  it("blocks when the frozen artwork no longer resolves — no Daily exemption", () => {
    const broken = {
      ...DAILY_ITEM,
      asset_status: {
        ...DAILY_ITEM.asset_status,
        status: "unresolved",
        reason: "assets.subject.icon: file is not on disk",
        unresolved: [{ channel: "assets.subject.icon", path: "assets/items/1036.png" }],
      },
    };
    const readiness = evaluateContentReadiness(broken as never);
    expect(readiness.blocking).toBe(true);
  });
});

const commandConfig: ContentCommandConfig = {
  questionIds: [],
  reviewKeys: [KEY],
  formats: [...DEFAULT_FORMAT_KEYS],
  states: [...DEFAULT_STATES],
  post: null,
  difficulty: null,
  runId: null,
  overwrite: false,
};

describe("the key travels", () => {
  it("round-trips through the REAL CLI parser", () => {
    const built = buildContentCommand(commandConfig);
    expect(built.command).toContain(`--review-key ${KEY}`);
    const parsed = parseScreenshotCli(built.args);
    expect(parsed.source).toEqual({ mode: "review-key", keys: [KEY] });
  });

  it("serializes as a v2 handoff and parses back to the same key", () => {
    const built = contentHandoffFromCommandConfig(commandConfig);
    expect(isFailure(built)).toBe(false);
    if (isFailure(built)) return;
    expect(built.handoff.version).toBe(2);
    const params = encodeContentHandoffParams(built.handoff);
    const back = decodeContentHandoffParams(params);
    expect(isFailure(back)).toBe(false);
    if (isFailure(back)) return;
    expect(back.handoff.reviewKeys).toEqual([KEY]);
    expect(back.handoff.items).toEqual([{ kind: "review-key", value: KEY }]);
  });
});

describe("provenance identifies the exact snapshot", () => {
  it("records the Daily framing beside the identity, not inside it", () => {
    const entry = manifestSourceEntry(DAILY_ITEM as never);
    expect(entry).toEqual({
      id: KEY,
      review_key: KEY,
      source_kind: "daily_card",
      materialization: "frozen_snapshot",
      family: "item_cost",
      source_version:
        "58173623e3094b7b84d08d0afdbefe4fc76d96edb16f44779ebe8ba395c8a746",
      specimen_version: null,
      data_version: null,
      framing: DAILY_ITEM.provenance.framing,
    });
  });

  it("answers WHICH frozen card produced the asset", () => {
    const { framing } = manifestSourceEntry(DAILY_ITEM as never);
    expect(framing).toMatchObject({
      challenge_date: "2026-08-20",
      challenge_version: 1,
      sequence: 12,
      frozen: true,
    });
  });

  it("keeps the source ROW identity as provenance, never as identity", () => {
    const entry = manifestSourceEntry(DAILY_ITEM as never);
    expect(entry.id).toBe(KEY);
    expect(entry.id).not.toBe(DAILY_ITEM.provenance.source_question_id);
    expect(DAILY_ITEM.provenance.source_question_id).toBe(87);
  });

  it("leaves a source with no framing recording null, inventing nothing", () => {
    expect(manifestSourceEntry({ id: 41 }).framing).toBeNull();
    expect(
      manifestSourceEntry({
        id: "mastery:ssm.base.BARRIER",
        review_key: "mastery:ssm.base.BARRIER",
        source_kind: "mastery_question",
        provenance: { review_key: "x", source_kind: "mastery_question" },
      }).framing,
    ).toBeNull();
  });
});
