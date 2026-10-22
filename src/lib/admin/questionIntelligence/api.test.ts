import { afterEach, describe, expect, it, vi } from "vitest";
import golden from "@/lib/admin/__fixtures__/question-intelligence-v1.json";
import {
  fetchQuestionIntelligence,
  parseQuestionIntelligence,
  QuestionIntelligenceParseError,
  questionIntelligenceQuery,
  QuestionIntelligenceReadError,
  type QiFilters,
} from "./api";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "https://railway.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner" })),
}));

const FILTERS: QiFilters = {
  from: "2026-10-10", to: "2026-10-12", host: "all", stageKind: "", namespace: "", family: "",
  minServed: 1, cohort: "product", sort: "served", offset: 0, limit: 50,
};

describe("QI1 parser · the backend golden response", () => {
  // The fixture is the backend's own golden (services/golden/
  // question_intelligence_v1.json), so both repos pin one contract.
  const parsed = parseQuestionIntelligence(golden);

  it("reads totals, paging and limitations", () => {
    expect(parsed.totals).toMatchObject({ served: 9, answered: 8, correct: 5, incorrect: 3, timeout: 1, questions: 4 });
    expect(parsed.totals.repeats).toMatchObject({ repeatVsPreviousDays: 2, lookbackDays: 7 });
    expect(parsed.page).toEqual({ offset: 0, limit: 50, total: 4, nextOffset: null });
    expect(parsed.limitations.length).toBeGreaterThan(0);
  });

  it("keeps the displayed-position distribution exactly as served", () => {
    const [q1, q2, , reflex] = parsed.questions;
    expect(q1.ref).toBe("quiz:champion:q1");
    expect(q1.rates).toEqual({ correct: 0.5, incorrect: 0.25, timeout: 0.25, answered: 0.75 });
    expect(q1.positions.byPosition.map((p) => [p.position, p.shownCorrect, p.pickedCorrect, p.pickedWrong])).toEqual([
      [1, 2, 2, 0], [2, 0, 0, 0], [3, 2, 0, 0], [4, 0, 0, 1],
    ]);
    expect(q1.repeats).toMatchObject({ repeatExposures: 1, multiDayPlayers: 1, maxDaysOnePlayer: 2 });
    expect(q1.hosts).toEqual({ daily: 2, ranked: 2, other: 0 });
    expect(q2.positions.optionCounts).toEqual({ "4": 2 });
    expect(reflex.positions.optionCounts).toEqual({ "2": 1 });
    expect(reflex.prompt).toBe("Who has more HP?");
    expect(reflex.stageKinds).toEqual({ time_trial: 1 });
  });

  it("refuses an unknown schema version and a missing ref, ignores unknown keys", () => {
    expect(() => parseQuestionIntelligence({ ...golden, schema_version: 2 })).toThrow(QuestionIntelligenceParseError);
    expect(() => parseQuestionIntelligence({ ...golden, questions: [{ served: 1 }] })).toThrow(/question ref/);
    const extra = parseQuestionIntelligence({ ...golden, future_field: { x: 1 } });
    expect(extra.questions).toHaveLength(4);
  });

  it("reads the DREP1 forced / avoidable split per ref and in total", () => {
    const [q1, q2, q3] = parsed.questions;
    expect(q1.repeats.drep1).toEqual({ forced: 1, avoidable: 0, outsideScope: 0, unclassified: 0 });
    expect(q3.ref).toBe("quiz:item:q3");
    expect(q3.repeats.drep1).toEqual({ forced: 0, avoidable: 1, outsideScope: 0, unclassified: 0 });
    expect(q2.repeats.drep1).toEqual({ forced: 0, avoidable: 0, outsideScope: 0, unclassified: 0 });
    expect(parsed.totals.repeats.drep1).toEqual({
      forced: 1, avoidableProtected: 1, avoidableUnprotected: 0, outsideScope: 0,
      unclassified: 0, snapshotsRead: 1, childrenNeeded: 1, readCap: 60,
    });
  });

  it("reads an absent or partial DREP1 split as not reported, never as zeros", () => {
    const row = { ...golden.questions[0], repeats: { ...golden.questions[0].repeats, drep1: { forced: 1 } } };
    const totals = { ...golden.totals, repeats: { ...golden.totals.repeats, drep1: undefined } };
    const out = parseQuestionIntelligence({ ...golden, questions: [row], totals });
    expect(out.questions[0].repeats.drep1).toBeNull();
    expect(out.totals.repeats.drep1).toBeNull();
  });

  it("reads a malformed rate as not recorded, never as a figure", () => {
    const q = { ...golden.questions[0], rates: { correct: "50%", incorrect: null } };
    const parsedRow = parseQuestionIntelligence({ ...golden, questions: [q] }).questions[0];
    expect(parsedRow.rates.correct).toBeNull();
    expect(parsedRow.rates.incorrect).toBeNull();
  });

  it("refuses a row or total missing a served / outcome count instead of drawing 0", () => {
    const row = { ...golden.questions[0], served: "4" };
    expect(() => parseQuestionIntelligence({ ...golden, questions: [row] })).toThrow(/served/);
    const { timeout: _dropped, ...totals } = golden.totals;
    expect(() => parseQuestionIntelligence({ ...golden, totals })).toThrow(/total timeout/);
  });
});

describe("QI1 client · query and errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only the filters that are set", () => {
    const q = questionIntelligenceQuery({ ...FILTERS, stageKind: " survival ", host: "daily" });
    expect(q.get("stage_kind")).toBe("survival");
    expect(q.get("host")).toBe("daily");
    expect(q.has("namespace")).toBe(false);
    expect(q.get("min_served")).toBe("1");
  });

  it("calls the owner endpoint with owner headers and parses the answer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(golden), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchQuestionIntelligence(FILTERS);
    expect(out.questions).toHaveLength(4);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith("https://railway.test/api/admin/question-intelligence?")).toBe(true);
    expect(init.headers).toEqual({ Authorization: "Bearer owner" });
    expect(init.cache).toBe("no-store");
  });

  it.each([
    [403, "denied"],
    [401, "denied"],
    [500, "unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
    await expect(fetchQuestionIntelligence(FILTERS)).rejects.toMatchObject({ kind });
  });

  it("surfaces the backend's reason for a refused filter", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ detail: { code: "INVALID_FILTER", message: "the range may span at most 92 days" } }), { status: 422 })));
    const err = await fetchQuestionIntelligence(FILTERS).catch((e) => e);
    expect(err).toBeInstanceOf(QuestionIntelligenceReadError);
    expect(err.kind).toBe("refused");
    expect(err.message).toMatch(/92 days/);
  });

  it("reports an unreadable body as invalid, not as an empty result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ schema_version: 9 }), { status: 200 })));
    await expect(fetchQuestionIntelligence(FILTERS)).rejects.toMatchObject({ kind: "invalid" });
  });
});
