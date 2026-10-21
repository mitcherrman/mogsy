import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/daily-history-v1.json";
import { DailyHistoryParseError, parseDailyHistory } from "./dailyHistoryApi";
import {
  ENTRY_LEAD_MS, ENTRY_LOOKBACK_MS, formatAccuracy, formatDuration, resolveEntrySource, runStatusLine,
  stageLabel, tierLabel, type EntryClick,
} from "./dailyHistory";

const history = () => parseDailyHistory(structuredClone(golden));
const completed = () => history().runs.find((r) => r.status === "completed")!;
const unfinished = () => history().runs.find((r) => r.status === "active")!;

describe("backend contract (golden payload v1, identical to the Railway test fixture)", () => {
  it("parses the payload the backend actually produces", () => {
    const h = history();
    expect(h.runs).toHaveLength(2);
    expect(h.truncated).toBe(false);
    const run = completed();
    expect(run.runId).toMatch(/^dr_/);
    expect(run.main).toEqual({ completed: true, completedAt: expect.any(String), score: 100 });
    expect(run.optional).toEqual({ total: 4, completed: 3, skipped: 1 });
    expect(run.stages.map((s) => s.kind)).toEqual(["standard", "time_trial", "survival", "weak_areas", "review"]);
    expect(run.stages[0]).toMatchObject({ tier: "main", state: "completed", elapsedMs: 120000 });
    expect(run.stages[0].result).toMatchObject({ score: 100, correct: 7, answered: 10, accuracy: 0.7, activeAnswerMs: 30000 });
    expect(run.correlation).toEqual({ visitorId: "vis-1", sessionId: "sess-1" });
    expect(run.stages[4]).toMatchObject({ state: "skipped", elapsedMs: null });
  });

  it("refuses an unsupported schema version rather than rendering guesses", () => {
    expect(() => parseDailyHistory({ ...golden, schema_version: 2 })).toThrow(DailyHistoryParseError);
    expect(() => parseDailyHistory({ runs: [] })).toThrow(DailyHistoryParseError);
    expect(() => parseDailyHistory(null)).toThrow(DailyHistoryParseError);
  });

  it("ignores unknown keys so additive backend changes cannot break the page", () => {
    const extended = structuredClone(golden) as Record<string, unknown>;
    extended.new_top_level = { x: 1 };
    (extended.runs as Record<string, unknown>[])[0].new_field = "later";
    expect(parseDailyHistory(extended).runs).toHaveLength(2);
  });

  it("turns a malformed number into 'not recorded', never zero", () => {
    const bad = structuredClone(golden) as { runs: { elapsed_ms: unknown; stages: { elapsed_ms: unknown; result: Record<string, unknown> }[] }[] };
    bad.runs[1].elapsed_ms = "120000";
    bad.runs[1].stages[0].elapsed_ms = Number.NaN;
    bad.runs[1].stages[0].result.score = "100";
    const run = parseDailyHistory(bad).runs[1];
    expect(run.elapsedMs).toBeNull();
    expect(run.stages[0].elapsedMs).toBeNull();
    expect(run.stages[0].result.score).toBeNull();
  });

  it("rejects an unknown stage state instead of mapping it to a known one", () => {
    const bad = structuredClone(golden) as { runs: { stages: { state: string }[] }[] };
    bad.runs[0].stages[0].state = "abandoned";
    expect(() => parseDailyHistory(bad)).toThrow(/unknown state/);
  });
});

describe("durations and accuracy", () => {
  it("formats only recorded, non-negative durations", () => {
    expect(formatDuration(120000)).toBe("2 min");
    expect(formatDuration(150000)).toBe("2 min 30 s");
    expect(formatDuration(45000)).toBe("45 s");
    expect(formatDuration(3_900_000)).toBe("1 h 5 min");
    expect(formatDuration(400)).toBe("under 1 s");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(-5)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });

  it("shows accuracy only when answers exist", () => {
    const stage = completed().stages[0];
    expect(formatAccuracy(stage)).toBe("7/10 (70%)");
    expect(formatAccuracy({ result: { ...stage.result, answered: 0, accuracy: null } })).toBeNull();
    expect(formatAccuracy({ result: { ...stage.result, correct: null } })).toBeNull();
  });

  it("the unfinished run has no run duration and no stage duration for unlaunched stages", () => {
    const run = unfinished();
    expect(run.elapsedMs).toBeNull();
    expect(run.stages.every((s) => s.elapsedMs === null)).toBe(true);
  });
});

describe("entry source", () => {
  const run = { createdAt: "2026-09-21T15:00:00.000000+00:00", correlation: { sessionId: "sess-1", visitorId: "vis-1" } };
  const click = (offsetMs: number, patch: Partial<EntryClick> = {}): EntryClick => ({
    sessionId: "sess-1", receivedAt: new Date(Date.parse(run.createdAt) + offsetMs).toISOString(),
    control: "academy_core_daily_button", ...patch,
  });

  it("names the button pressed in the same session just before the run was created", () => {
    const source = resolveEntrySource(run, [click(-5000)]);
    expect(source).toMatchObject({ kind: "observed", surface: "home_hub" });
    expect(source.kind === "observed" && source.label).toContain("Home Hub");
  });

  it("distinguishes Leaguecraft doors and takes the latest click before creation", () => {
    const source = resolveEntrySource(run, [click(-120000, { control: "academy_core_daily_button" }), click(-3000, { control: "play_scroll_daily_clause" })]);
    expect(source).toMatchObject({ kind: "observed", surface: "leaguecraft" });
  });

  it("never uses another session, a stale click or a click after the run", () => {
    expect(resolveEntrySource(run, [click(-1000, { sessionId: "other" })]).kind).toBe("not_recorded");
    expect(resolveEntrySource(run, [click(-(ENTRY_LOOKBACK_MS + 1))]).kind).toBe("not_recorded");
    expect(resolveEntrySource(run, [click(ENTRY_LEAD_MS + 1)]).kind).toBe("not_recorded");
    expect(resolveEntrySource(run, [click(ENTRY_LEAD_MS)]).kind).toBe("observed");
  });

  it("is not recorded when the run carries no session or there are no clicks", () => {
    const none = resolveEntrySource({ ...run, correlation: { sessionId: null, visitorId: "vis-1" } }, [click(-1000)]);
    expect(none).toMatchObject({ kind: "not_recorded" });
    expect(none.kind === "not_recorded" && none.reason).toContain("No browser session");
    expect(resolveEntrySource(run, [])).toMatchObject({ kind: "not_recorded" });
  });

  it("an unrecognised control is shown as such, not mapped to a known door", () => {
    const source = resolveEntrySource(run, [click(-1000, { control: "brand_new_button" })]);
    expect(source).toMatchObject({ kind: "observed", surface: "other" });
  });
});

describe("wording", () => {
  it("never says abandoned and reports where an unfinished run stands", () => {
    const line = runStatusLine(unfinished());
    expect(line.toLowerCase()).not.toContain("abandon");
    expect(line).toContain("Main Daily not completed");
  });

  it("distinguishes a perfect run from a reviewed one", () => {
    expect(runStatusLine(completed())).toContain("no misses");
    expect(runStatusLine({ ...completed(), outcome: "reviewed" })).toContain("including Review");
  });

  it("labels stages and roles, and leaves unknown kinds visible", () => {
    expect(stageLabel("standard")).toBe("Main Daily");
    expect(stageLabel("novel_kind")).toBe("Stage (novel_kind)");
    expect(tierLabel("main")).toBe("Required");
    expect(tierLabel("optional")).toBe("Optional");
    expect(tierLabel(null)).toBe("—");
  });
});
