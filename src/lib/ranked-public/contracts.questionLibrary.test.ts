/**
 * PT1.2 — the question-library contract.
 *
 * The endpoint is answer-free BY CONTRACT, so the reader's job is not merely
 * to shape the payload: it is to refuse one that carries anything a player
 * could answer from. These tests assert that refusal, because "the UI does not
 * render it" is not the same guarantee as "the client will not accept it".
 */
import { describe, expect, it } from "vitest";
import { readQuestionLibrary } from "./contracts";

const ENTRY = {
  canonical_question_ref: "ranked:v2-030",
  first_seen_at: "2026-08-01T10:00:00Z",
  last_seen_at: "2026-08-20T10:00:00Z",
  times_answered: 4,
  times_correct: 3,
  accuracy: 0.75,
  first_match_id: "rkb_abc",
  first_round_number: 2,
  metadata_status: "resolved",
  metadata_source: "frozen_round",
  question: { prompt: "What is Flash's base cooldown?", category: "Summoner Spells" },
};

const BODY = {
  schema_version: "ranked_duel.question_library.v1",
  projection_type: "question_library",
  match_id: null,
  round_number: null,
  server_time: "2026-09-02T12:00:00Z",
  payload: {
    scope: "ranked_discoveries",
    includes_default_library: false,
    metadata_source: "current_accepted_bank",
    summary: {
      unique_discovered: 1, total_answered: 4, total_correct: 3, accuracy: 0.75,
    },
    entries: [ENTRY],
    pagination: {
      limit: 25, offset: 0, count: 1, total_count: 1,
      has_more: false, order: "last_seen_at_desc",
    },
  },
};

const withEntry = (patch: Record<string, unknown>) => ({
  ...BODY,
  payload: { ...BODY.payload, entries: [{ ...ENTRY, ...patch }] },
});

describe("readQuestionLibrary", () => {
  it("reads the production payload into camelCase", () => {
    const view = readQuestionLibrary(BODY);
    expect(view.scope).toBe("ranked_discoveries");
    expect(view.includesDefaultLibrary).toBe(false);
    expect(view.summary).toEqual({
      uniqueDiscovered: 1, totalAnswered: 4, totalCorrect: 3, accuracy: 0.75,
    });
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].canonicalQuestionRef).toBe("ranked:v2-030");
    expect(view.entries[0].question?.prompt).toBe("What is Flash's base cooldown?");
    expect(view.pagination.order).toBe("last_seen_at_desc");
  });

  it("keeps an unavailable entry rather than dropping it", () => {
    // A discovery is permanent: a retired candidate must still be listed, with
    // the player's own counters intact.
    const view = readQuestionLibrary(
      withEntry({ metadata_status: "unavailable", question: null,
                  metadata_source: "current_accepted_bank" }),
    );
    expect(view.entries[0].metadataStatus).toBe("unavailable");
    expect(view.entries[0].question).toBeNull();
    expect(view.entries[0].timesAnswered).toBe(4);
  });

  it("accepts null accuracy — no data is not zero accuracy", () => {
    const view = readQuestionLibrary(
      withEntry({ accuracy: null, times_answered: 0, times_correct: 0 }),
    );
    expect(view.entries[0].accuracy).toBeNull();
  });

  it("accepts a discovery that outlived its match", () => {
    const view = readQuestionLibrary(
      withEntry({ first_match_id: null, first_round_number: null }),
    );
    expect(view.entries[0].firstMatchId).toBeNull();
    expect(view.entries[0].firstRoundNumber).toBeNull();
  });

  it.each([
    ["correct_index", { correct_index: 2 }],
    ["correctIndex", { correctIndex: 2 }],
    ["correct_answer", { correct_answer: "5 minutes" }],
    ["options", { options: ["a", "b"] }],
    ["explanation", { explanation: "because…" }],
  ])("rejects an entry leaking %s", (_label, patch) => {
    expect(() => readQuestionLibrary(withEntry(patch))).toThrow(/leaked/);
  });

  it("rejects answer-bearing data nested inside question", () => {
    expect(() =>
      readQuestionLibrary(
        withEntry({ question: { prompt: "p", category: "c", options: ["a"] } }),
      ),
    ).toThrow(/leaked/);
  });

  it("rejects a leak at the payload level", () => {
    expect(() =>
      readQuestionLibrary({
        ...BODY,
        payload: { ...BODY.payload, correct_index: 1 },
      }),
    ).toThrow(/leaked/);
  });

  it("rejects the wrong projection or schema", () => {
    expect(() => readQuestionLibrary({ ...BODY, projection_type: "match_history" }))
      .toThrow(/projection_type/);
    expect(() => readQuestionLibrary({ ...BODY, schema_version: "ranked_duel.history.v1" }))
      .toThrow(/schema_version/);
  });

  it("rejects an invalid metadata_status rather than guessing", () => {
    expect(() => readQuestionLibrary(withEntry({ metadata_status: "maybe" })))
      .toThrow(/metadata_status/);
  });
});
