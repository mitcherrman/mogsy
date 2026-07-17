import { describe, expect, it } from "vitest";
import {
  DsaParseError,
  readHistory,
  readResolution,
  readResults,
  readRun,
  readToday,
} from "./dailyScoreAttackAdapters";
import {
  activeRunFixture,
  historyFixture,
  resolutionFixture,
  resultsFixture,
  terminalRunFixture,
  todayFixture,
} from "./testFixtures";

describe("readToday", () => {
  it("accepts valid metadata", () => {
    expect(readToday(todayFixture).challenge_date).toBe("2026-07-17");
  });
  it("rejects unknown schema versions", () => {
    expect(() => readToday({ ...todayFixture, schema_version: "v99" })).toThrow(DsaParseError);
  });
});

describe("readRun", () => {
  it("accepts an active run with exactly one question", () => {
    const run = readRun(activeRunFixture());
    expect(run.question?.sequence).toBe(1);
  });

  it("accepts a terminal run", () => {
    expect(readRun(terminalRunFixture()).status).toBe("expired");
  });

  it("rejects a question list", () => {
    expect(() => readRun({ ...activeRunFixture(), questions: [] })).toThrow(DsaParseError);
  });

  it("rejects pre-resolution correct_index", () => {
    const run = activeRunFixture();
    (run.question as Record<string, unknown>).correct_index = 0;
    expect(() => readRun(run)).toThrow(DsaParseError);
  });

  it("rejects pre-resolution explanation", () => {
    const run = activeRunFixture();
    (run.question as Record<string, unknown>).explanation = "leak";
    expect(() => readRun(run)).toThrow(DsaParseError);
  });

  it("rejects malformed timestamps", () => {
    expect(() => readRun(activeRunFixture({ expires_at: "2026-07-17 12:00" }))).toThrow(
      DsaParseError,
    );
    expect(() => readRun(activeRunFixture({ started_at: "2026-07-17T12:00:00" }))).toThrow(
      DsaParseError,
    );
  });

  it("rejects negative metrics", () => {
    expect(() => readRun(activeRunFixture({ total_score: -1 }))).toThrow(DsaParseError);
    expect(() => readRun(activeRunFixture({ combo: -2 }))).toThrow(DsaParseError);
  });

  it("rejects an active run with too few options", () => {
    const run = activeRunFixture();
    run.question = { ...run.question!, choices: ["only-one"] };
    expect(() => readRun(run)).toThrow(DsaParseError);
  });

  it("rejects out-of-range sequence", () => {
    const run = activeRunFixture({ sequence: 31 });
    run.question = { ...run.question!, sequence: 31 };
    expect(() => readRun(run)).toThrow(DsaParseError);
  });

  it("rejects a terminal run that still carries a question", () => {
    const run = terminalRunFixture() as Record<string, unknown>;
    run.question = activeRunFixture().question;
    expect(() => readRun(run)).toThrow(DsaParseError);
  });
});

describe("readResolution", () => {
  it("accepts a valid resolution with nested run", () => {
    const resolution = readResolution(resolutionFixture());
    expect(resolution.run.sequence).toBe(2);
  });
  it("rejects a resolution missing multiplier", () => {
    const raw = resolutionFixture() as Record<string, unknown>;
    delete raw.multiplier;
    expect(() => readResolution(raw)).toThrow(DsaParseError);
  });
});

describe("readResults", () => {
  it("accepts terminal results with breakdown", () => {
    expect(readResults(resultsFixture()).breakdown).toHaveLength(2);
  });
  it("rejects active results", () => {
    const raw = {
      ...activeRunFixture(),
      schema_version: "daily_score_attack.results.v1",
      breakdown: [],
    };
    expect(() => readResults(raw)).toThrow(DsaParseError);
  });
});

describe("readHistory", () => {
  it("accepts valid history", () => {
    expect(readHistory(historyFixture).daily_streak).toBe(1);
  });
  it("rejects negative streaks", () => {
    expect(() => readHistory({ ...historyFixture, daily_streak: -1 })).toThrow(DsaParseError);
  });
});
