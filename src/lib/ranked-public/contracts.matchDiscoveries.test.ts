/**
 * PT1.3 — the post-match discovery contract.
 *
 * A ceremony that leaked the correct answer to a question still in the Ranked
 * bank would be worse than no ceremony, so the reader REFUSES an
 * answer-bearing payload rather than trusting the presentation layer to omit
 * it. These tests assert that refusal, and the arithmetic the reveal prints.
 */
import { describe, expect, it } from "vitest";
import { RankedPublicParseError, readMatchDiscoveries } from "./contracts";

const ENTRY = {
  canonical_question_ref: "ranked:v2-030",
  first_seen_at: "2026-09-03T12:00:00Z",
  first_round_number: 2,
  metadata_status: "resolved",
  metadata_source: "frozen_round",
  question: { prompt: "What is Flash's base cooldown?", category: "Summoner Spells" },
};

const BODY = {
  schema_version: "ranked_duel.match_discoveries.v1",
  projection_type: "match_discoveries",
  match_id: "rkb_abc",
  round_number: null,
  server_time: "2026-09-03T12:00:05Z",
  payload: {
    scope: "ranked_discoveries",
    includes_default_library: false,
    match_id: "rkb_abc",
    new_discoveries: [ENTRY],
    new_count: 1,
    collection_total: 423,
    collection_total_before: 422,
    truncated: false,
  },
};

const withPayload = (patch: Record<string, unknown>) => ({
  ...BODY, payload: { ...BODY.payload, ...patch },
});

const withEntry = (patch: Record<string, unknown>) =>
  withPayload({ new_discoveries: [{ ...ENTRY, ...patch }] });

describe("readMatchDiscoveries", () => {
  it("reads the production payload into camelCase", () => {
    const view = readMatchDiscoveries(BODY);
    expect(view.matchId).toBe("rkb_abc");
    expect(view.scope).toBe("ranked_discoveries");
    expect(view.includesDefaultLibrary).toBe(false);
    expect(view.newCount).toBe(1);
    expect(view.collectionTotal).toBe(423);
    expect(view.collectionTotalBefore).toBe(422);
    expect(view.truncated).toBe(false);
    expect(view.newDiscoveries).toEqual([{
      canonicalQuestionRef: "ranked:v2-030",
      firstSeenAt: "2026-09-03T12:00:00Z",
      firstRoundNumber: 2,
      metadataStatus: "resolved",
      metadataSource: "frozen_round",
      question: { prompt: "What is Flash's base cooldown?", category: "Summoner Spells" },
    }]);
  });

  it("accepts a zero-discovery match as a real answer, not an error", () => {
    const view = readMatchDiscoveries(withPayload({
      new_discoveries: [], new_count: 0,
      collection_total: 12, collection_total_before: 12,
    }));
    expect(view.newDiscoveries).toEqual([]);
    expect(view.newCount).toBe(0);
    expect(view.collectionTotal).toBe(12);
  });

  it("accepts a first-ever discovery on an empty collection", () => {
    const view = readMatchDiscoveries(withPayload({
      new_count: 1, collection_total: 1, collection_total_before: 0,
    }));
    expect(view.collectionTotalBefore).toBe(0);
  });

  it("keeps an unresolvable entry rather than dropping it", () => {
    const view = readMatchDiscoveries(withEntry({
      metadata_status: "unavailable", metadata_source: "current_serving_bank",
      question: null,
    }));
    expect(view.newDiscoveries).toHaveLength(1);
    expect(view.newDiscoveries[0].question).toBeNull();
    expect(view.newDiscoveries[0].metadataStatus).toBe("unavailable");
  });

  it("tolerates a null round number (a discovery outlives its provenance)", () => {
    expect(readMatchDiscoveries(withEntry({ first_round_number: null }))
      .newDiscoveries[0].firstRoundNumber).toBeNull();
  });

  it("rejects the wrong projection type", () => {
    expect(() => readMatchDiscoveries({ ...BODY, projection_type: "match_review" }))
      .toThrow(RankedPublicParseError);
  });

  it.each([
    ["correct_index", { correct_index: 0 }],
    ["correctIndex", { correctIndex: 0 }],
    ["options", { options: ["1", "2"] }],
    ["explanation", { explanation: { steps: ["x"] } }],
    ["calculation_steps", { calculation_steps: ["450 + 50"] }],
    ["distractors", { distractors: { "2500": "forgot the potion" } }],
  ])("refuses an entry carrying %s", (_label, patch) => {
    expect(() => readMatchDiscoveries(withEntry(patch)))
      .toThrow(RankedPublicParseError);
  });

  it("refuses answer-bearing data on the payload itself", () => {
    expect(() => readMatchDiscoveries(withPayload({ answers: ["a"] })))
      .toThrow(RankedPublicParseError);
  });

  it("refuses answer-bearing data nested inside the question", () => {
    expect(() => readMatchDiscoveries(withEntry({
      question: { prompt: "p", category: "c", correct_answer: "2400" },
    }))).toThrow(RankedPublicParseError);
  });

  it("refuses a malformed metadata status", () => {
    expect(() => readMatchDiscoveries(withEntry({ metadata_status: "maybe" })))
      .toThrow(RankedPublicParseError);
  });

  it("refuses a non-array discovery list", () => {
    expect(() => readMatchDiscoveries(withPayload({ new_discoveries: {} })))
      .toThrow(RankedPublicParseError);
  });

  it("refuses a missing count rather than defaulting it to zero", () => {
    expect(() => readMatchDiscoveries(withPayload({ new_count: undefined })))
      .toThrow(RankedPublicParseError);
  });
});
